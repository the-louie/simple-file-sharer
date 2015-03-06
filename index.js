var express    = require('express')
var app 	   = express()

var config 	 = require('./config');
var sqlite   = require('sqlite3').verbose();
var db 		 = new sqlite.Database(config.db_name);
var fs 		 = require('fs');
var mime     = require('mime');
var crypto   = require('crypto');

// Create table if it doesn't already exist.
db.run("CREATE TABLE IF NOT EXISTS uploaded_files (fid INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT, sha TEXT, timestamp INTEGER DEFAULT (strftime('%s', 'now')), collectionID TEXT, fileSize INTEGER, remote_ip INTEGER)");
db.run("CREATE TABLE IF NOT EXISTS uploaded_chunks (cid INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, filename TEXT, chunk_id INT, timestamp TIMESTAMP default current_timestamp);")

// auth stuff
if (config.authdetails && config.authdetails.username && config.authdetails.password) {
	var session = require('express-session');
	var passport = require('passport');
	var LocalStrategy = require('passport-local').Strategy;

	app.use(session({ secret: config.secret, resave: false, saveUninitialized: false }));
	app.get('/login', function(request, response) {
	  response.sendFile(__dirname + '/static/login.html');
	});
	app.use(passport.initialize());
	app.use(passport.session());
	app.post('/login',
	  passport.authenticate('local', {
		successRedirect: '/',
		failureRedirect: '/login'
	  })
	);

	passport.serializeUser(function(user, done) { done(null, user); });
	passport.deserializeUser(function(user, done) { done(null, user); });
	passport.use(new LocalStrategy(function(username, password, done) {
		process.nextTick(function() {
			if (username == config.authdetails.username && password == config.authdetails.password)
				return done(null, config.authdetails.username);
			else
				return done("No such user or password");
		});
	}));
	app.use(function(request, response, next) {
		if (request.user == null && request.path.indexOf('/login') !== 0) {
			response.redirect('/login');
			return;
		}
		next();
	});
}
// end auth stuff


app.use(express.static(__dirname + '/static/'));


app.post('/upload/', function(request, response) {
	var fileBuffer = new Buffer("", 'binary');
	request.on('data', function (postDataChunk) {
		var inBuffer = new Buffer(postDataChunk, 'binary')
		fileBuffer = Buffer.concat([fileBuffer, inBuffer])
	});

	request.on('end', function () {
		if (fileBuffer.length <= 0) { console.error("serveUploadChunks: fileBuffer empty"); response.statusCode = 431; response.end(); return false; }

		var uuid              = request.query.uuid;
		var chunkID           = request.query.chunkIndex;
		var remoteAddress     = request.connection.remoteAddress;

		var fileName          = crypto.createHash('sha256').update(
									chunkID +
									config.secret +
									remoteAddress + uuid
								).digest("hex") + "_" + chunkID;

		// save chunk to database
		var stmt = db.prepare('INSERT INTO uploaded_chunks (uuid, filename, chunk_id) VALUES (?,?,?)');
		stmt.run(uuid, fileName, chunkID);
		stmt.finalize();

		// save chunk to file
		chunkFile = fs.createWriteStream(config.upload_dir+'/pending/'+fileName);
		chunkFile.write(fileBuffer);
		chunkFile.end();

		response.write(JSON.stringify({'fileName':fileName, 'chunk':chunkID}));
		response.statusCode = 200;
		response.end();

		console.log(remoteAddress,'uploaded',fileName,chunkID)
	});

});

app.get('/d/:fileName/', function (request, response) {
	var sha = request.params.fileName;

	var query = "SELECT fileName FROM uploaded_files WHERE sha = ?";
	db.get(query, [sha], function(err, row) {
		if (null == row || null == row.fileName) {
			console.error('ERROR: Unknown hash, "' + sha + '"');
			response.status(404).end();
			return false;
		}

		var fileName = __dirname + config.upload_dir.replace(/^\./,'')+'/'+sha;
		if (!fs.existsSync(fileName)) {
			console.error('ERROR: No such file "' + fileName + '"');
			response.status(404).end();
			return false;
		}

		var header = {};
		var realFileName = row.fileName;

		var mimeType = mime.lookup(realFileName);
		if (mimeType.split('/')[0] == 'image') {
			console.log('viewing" ' + fileName + '"', {'Content-Type': mimeType});
			response.sendFile(fileName, {'headers':{ 'Content-Type': mimeType}}, function(err) {
			    if (err) {
			      console.log(err);
			      response.status(err.status).end();
			    }
			});
		} else {
			console.log(request.connection.remoteAddress,'downloading" ' + fileName + '"');
			response.download(fileName, realFileName, function(err) {
			    if (err) {
			      console.log(err);
			      response.status(err.status).end();
			    }
			});
		}

	});
})

app.post('/merge/', function (request, response) {
	var uuid              = request.query.uuid;
	var chunkID           = request.query.chunkIndex;
	var remoteAddress     = request.connection.remoteAddress;
	var originalFileName  = request.query.name;
	var collectionID      = request.query.collectionID;

	var fileName          = crypto.createHash('sha256').update(
								originalFileName +
								(new Date().getTime()) +
								config.secret +
								remoteAddress
							).digest("hex");

	var query = "SELECT filename FROM uploaded_chunks WHERE uuid = ? ORDER BY chunk_id";
	var result_file = fs.createWriteStream(config.upload_dir+'/'+fileName);
	var fileList = [];
	var fileSize = 0;
	db.all(query, [uuid], function(err, rows) {
		for (r in rows) {
			row = rows[r];
			var chunkFileName = row.filename;

			chunkData = fs.readFileSync(config.upload_dir+'/pending/'+chunkFileName);
			result_file.write(chunkData);
			fileSize += chunkData.length;
			fileList.push(config.upload_dir+'/pending/'+chunkFileName);
		}

		result_file.end(function() {
			for (i in fileList) {
				thisFile = fileList[i];
				fs.unlink(thisFile, function (err) {
					if (err) throw err;
				});
			}
		});

		var stmt = db.prepare('DELETE FROM uploaded_chunks WHERE uuid = ?');
		stmt.run(uuid);
		stmt.finalize();

		var stmt = db.prepare('INSERT INTO uploaded_files (fileName, sha, collectionID, fileSize, remote_ip) VALUES (?,?,?,?,?)');
		stmt.run(originalFileName, fileName, collectionID, fileSize, remoteAddress);
		stmt.finalize();

		response.write(JSON.stringify({'fileName':fileName}));
		response.statusCode = 200;
		response.end();
	});
});

app.get('/c/:collectionID', function (request, response) {
	var collectionID = request.params.collectionID;
	var query = "SELECT filename, sha, fileSize FROM uploaded_files WHERE collectionID = ? ORDER BY fid";
	db.all(query, [collectionID], function(err, rows) {
		if(rows) {
			files = [];
			for (r in rows) {
				row = rows[r];
				files.push({fileName:row.fileName,sha:row.sha,fileSize:row.fileSize});
			}
			response.writeHead(200, "text/html");
			response.end(JSON.stringify(files));
		} else
			response.status(404).end();
			return false;
	});
});

var server = app.listen(config.port, config.ip, function () {
  var host = server.address().address
  var port = server.address().port
})

console.log("simple-file-sharer started on "+config.ip+":"+config.port);