
import fs from "fs";
import mime from "mime";
import crypto from "crypto";
import _ from "lodash";
import express from "express";
import session from "express-session";
import passport from "passport";
import passportLocal from "passport-local";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const LocalStrategy = passportLocal.Strategy;

var currentPath = process.cwd();
var app 	   = express();

var validChars = [ 'A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z', 'a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','0','1','2','3','4','5','6','7','8','9','-','_','.','~' ];

var config;



try {
	config 	 = require('./config.json');
} catch (e) {
	console.log("\n!                                                  !");
	console.log("!      WARNING! USING DEAFULT CONFIGURATION        !");
	console.log("!                                                  !");
	console.log("!  Please copy config_example.json to config.json  !");
	console.log("!  and modify it according to your needs.          !\n\n");
	config = {
		"ip": "localhost",
		"port": 9898,
		"upload_dir": "./uploads",
		"static_dir": "./static",
		"db_name": "./memory.db",
		"secret": "rbDNSGCTdvDacGGvR gz7FbXzZrhhgp3BL6bIgNuGxGjve3U072Z7WzOwdeSSevC",
		"randomId": true,
		// "hashId": false,
		// "short_hash": true,
	};
}

//var Bluebird = require('bluebird');
import sqlite from "sqlite3";
var db 	   = new sqlite.Database(config.db_name);

// Create table if it doesn't already exist.
db.run("CREATE TABLE IF NOT EXISTS uploaded_files (fid INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT, sha TEXT, timestamp INTEGER DEFAULT (strftime('%s', 'now')), collectionID TEXT, fileSize INTEGER, remote_ip INTEGER)");
db.run("CREATE TABLE IF NOT EXISTS uploaded_chunks (cid INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT, filename TEXT, chunk_id INT, timestamp TIMESTAMP default current_timestamp);");

var secret = crypto.createHash('sha256').update(config.secret+(new Date().getTime())).digest("hex");


// auth stuff
if (config.authdetails && config.authdetails.username && config.authdetails.password) {
	app.use(session({ secret: config.secret, resave: false, saveUninitialized: false }));
	app.use(passport.initialize());
	app.use(passport.session());

	// Setup body parser only for login route (after session/passport setup)
	app.use('/login', express.urlencoded({ extended: false }));
	app.use('/login', express.json());

	app.get('/login', function(request, response) {
	  response.sendFile(currentPath + '/static/login.html');
	});
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
		// Allow access to login page, download URLs, and collection URLs without authentication
		if (!request.user &&
			!request.path.startsWith('/login') &&
			!request.path.startsWith('/d/') &&
			!request.path.startsWith('/c/')) {
			return response.redirect('/login');
		}
		next();
	});
}
// end auth stuff

app.use(function(request, response, next) {
	if (config.surl && request.headers.host != (config.surl + ':' + config.port)) {
		var rdr = 'http://'+config.surl + ':' + (request.app.settings.port || config.port || '80') + (request.path || '/');
		response.redirect(rdr);
	} else {
		next();
	}
});


app.use(express.static(currentPath + '/static/'));

const safeRandomId = async (length) => new Promise((resolve, _reject) => {
	if (length === undefined)
		length = 2;
	else if (length > 64)
		return resolve(false);

	var id = crypto
		.randomBytes(length)
		.map(function(c) {
			return validChars[c % validChars.length];
		})
		.join('');

	db.get("SELECT count(*) c FROM uploaded_files WHERE sha=?", [id], (err, dbres) => {
		if (err)
			return resolve(false);
		if (dbres.c === 0)
			return resolve(id);
		else
			safeRandomId(length + 1).then(resolve);
	});
})

async function hashId(originalFileName, remoteAddress) {
	var result = crypto
		.createHash('sha256')
		.update(originalFileName)
		.update(new Date().getTime().toString())
		.update(config.secret)
		.update(remoteAddress)
		.digest("hex");

	if (config.short_hash)
		result = await shortenHash(result);

	return result;
}

function shortenHash(hash) {
	return new Promise(function (resolve, reject) {
		function checkLength(i) {
			if (i >= hash.length) {
				return resolve(false);
			}

			db.get("SELECT count(*) c FROM uploaded_files WHERE sha=?", [hash.substr(0,i)], (err, dbres) => {
				if (err) {
					return resolve(false);
				}
				if (dbres.c === 0) {
					return resolve(hash.substr(0,i));
				}
				checkLength(i + 1);
			});
		}
		checkLength(4);
	});
}


app.post('/upload/', function(request, response) {
	var fileBuffer = Buffer.from("", 'binary');
	request.on('data', function (postDataChunk) {
		var inBuffer = Buffer.from(postDataChunk, 'binary');
		fileBuffer = Buffer.concat([fileBuffer, inBuffer]);
	});

	request.on('end', function () {
		if (fileBuffer.length <= 0) {
			console.error("serveUploadChunks: fileBuffer empty");
			response.status(431).end();
			return false;
		}

		var uuid              = request.query.uuid;
		var chunkID           = request.query.chunkIndex;
		var remoteAddress     = request.ip;

		var fileName          = crypto.createHash('sha256').update(
									chunkID +
									config.secret +
									remoteAddress + uuid
								).digest("hex") + "_" + chunkID;

		// save chunk to database
		var stmt = db.prepare('INSERT INTO uploaded_chunks (uuid, filename, chunk_id) VALUES (?,?,?)');
		stmt.run(uuid, fileName, chunkID, function(err) {
			if (err) {
				console.error("Database error:", err);
				response.status(500).end("Database error");
				return;
			}
			stmt.finalize();

			// save chunk to file
			var chunkFile = fs.createWriteStream(config.upload_dir+'/pending/'+fileName);
			chunkFile.write(fileBuffer);
			chunkFile.end(function(err) {
				if (err) {
					console.error("File write error:", err);
					response.status(500).end("File write error");
					return;
				}

				response.writeHead(200, {'Content-Type': 'application/json'});
				response.write(JSON.stringify({'fileName':fileName, 'chunk':chunkID}));
				response.end();
			});
		});

		console.log(remoteAddress,'uploaded',fileName,chunkID);
	});

});

app.get('/d/:fileName/', function (request, response) {
	var sha = request.params.fileName.replace(/\.[A-Za-z0-9]{3}$/,"");

	var query = "SELECT fileName FROM uploaded_files WHERE sha = ?";
	db.get(query, [sha], function(err, row) {
		if (row === undefined || row.fileName === undefined) {
			console.error('ERROR: Unknown hash, "' + sha + '"');
			response.status(404).end();
			return false;
		}

		var fileName = currentPath + config.upload_dir.replace(/^\./,'')+'/'+sha;
		if (!fs.existsSync(fileName)) {
			console.error('ERROR: No such file "' + fileName + '"');
			response.status(404).end();
			return false;
		}

		var header = {};
		var realFileName = row.fileName;

		var mimeType = mime.getType(realFileName) || 'application/octet-stream';
		if (mimeType && mimeType.split('/')[0] == 'image') {
			console.log('viewing" ' + fileName + '"', {'Content-Type': mimeType});
			response.sendFile(fileName, {'headers':{ 'Content-Type': mimeType}}, function(err) {
			    if (err) {
			      console.log(err);
			      response.status(err.status).end();
			    }
			});
		} else {
			console.log(request.ip,'downloading" ' + fileName + '"');
			response.download(fileName, realFileName, function(err) {
			    if (err) {
			      console.log(err);
			      response.status(err.status).end();
			    }
			});
		}

	});
});

// FIXME: async
app.post('/merge/', async function (request, response) {
	var uuid              = request.query.uuid;
	var chunkID           = request.query.chunkIndex;
	var remoteAddress     = request.ip;
	var originalFileName  = request.query.name;
	var collectionID      = request.query.collectionID;

	console.log("Merge request:", {uuid, chunkID, originalFileName, collectionID});

	var fileName;
	try {
		if (config.randomId)
			fileName 		  = await safeRandomId();
		else
			fileName  	      = await hashId(originalFileName, remoteAddress);
	} catch (err) {
		console.error("Error generating filename:", err);
		response.status(500).end("Error generating filename");
		return;
	}

	if (!fileName) {
		console.error("Failed to create filename");
		response.status(500).end("Failed to create filename");
		return;
	}

	console.log("Generated filename:", fileName);


	var query = "SELECT filename FROM uploaded_chunks WHERE uuid = ? ORDER BY chunk_id";
	var result_file = fs.createWriteStream(config.upload_dir+'/'+fileName);
	var fileList = [];
	var fileSize = 0;
	db.all(query, [uuid], function(err, rows) {
		if (err) {
			console.error("Database query error:", err);
			response.status(500).end("Database query error");
			return;
		}

		if (!rows || rows.length === 0) {
			console.error("No chunks found for uuid:", uuid);
			response.status(404).end("No chunks found");
			return;
		}

		rows.forEach(function(row) {
			var chunkFileName = row.filename;

			try {
				var chunkData = fs.readFileSync(config.upload_dir+'/pending/'+chunkFileName);
				result_file.write(chunkData);
				fileSize += chunkData.length;
				fileList.push(config.upload_dir+'/pending/'+chunkFileName);
			} catch (fileErr) {
				console.error("Error reading chunk file:", fileErr);
				response.status(500).end("Error reading chunk file");
				return;
			}
		});

		result_file.end(function() {
			fileList.forEach(function(file) {
				fs.unlink(file, function (err) {
					if (err) console.error("Error deleting chunk file:", err);
				});
			});
		});

		var stmt;
		stmt = db.prepare('DELETE FROM uploaded_chunks WHERE uuid = ?');
		stmt.run(uuid, function(err) {
			if (err) console.error("Error deleting chunks:", err);
			stmt.finalize();

			stmt = db.prepare('INSERT INTO uploaded_files (fileName, sha, collectionID, fileSize, remote_ip) VALUES (?,?,?,?,?)');
			stmt.run(originalFileName, fileName, collectionID, fileSize, remoteAddress, function(err) {
				if (err) {
					console.error("Error inserting file record:", err);
					response.status(500).end("Error inserting file record");
					return;
				}
				stmt.finalize();

				response.writeHead(200, {'Content-Type': 'application/json'});
				response.write(JSON.stringify({'fileName':fileName}));
				response.end();
			});
		});
	});
});

app.get('/c/:collectionID', function (request, response) {
	var collectionID = request.params.collectionID;
	var query = "SELECT filename, sha, fileSize FROM uploaded_files WHERE collectionID = ? ORDER BY fid";
	db.all(query, [collectionID], function(err, rows) {
		if(rows) {
			var files = rows.map(function(row) {
				return {fileName:row.fileName,sha:row.sha,fileSize:row.fileSize};
			});

			response.writeHead(200, "text/html");
			response.end(JSON.stringify(files));
		} else {
			response.status(404).end();
			return false;
		}
	});
});

var server = app.listen(config.port, config.ip, function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log("simple-file-sharer started on http://"+host+":"+port);
});
