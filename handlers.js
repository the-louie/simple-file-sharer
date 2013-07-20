var config   = require('./config'),
    mime     = require('mime'),
    crypto   = require('crypto'),
    sqlite   = require('sqlite3'),
    fs       = require('fs'),

    db       = new sqlite.Database(config.db_name),

    handlers = {
            'home'      : serveHome,
            'upload'    : serveUpload,
            'static'    : serveStatic,
            'd'         : serveDownload
        };

// Create table if it doesn't already exist.
db.run("CREATE TABLE IF NOT EXISTS uploaded_files (fid INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT, md5 TEXT, timestamp INTEGER DEFAULT (strftime('%s', 'now')), remote_ip INTEGER)");

// Serve / and /home
function serveHome(response, pathname, postData) {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(fs.readFileSync(config.static_dir+'/index.html'));
    return true;
}


// Handle uploads, save them to a file and add it to the database
function serveUpload(response, pathname, postData) {
    var file              = JSON.parse(postData);
    var originalFileName  = file.name;
    var fileName          = crypto.createHash('sha256').update(file.name+(new Date().getTime())+config.secret).digest("hex");

    file.contents = file.contents.split(',').pop();
    fileBuffer = new Buffer(file.contents, "base64");
    fs.writeFileSync(config.upload_dir+'/'+fileName, fileBuffer);

    stmt = db.prepare('INSERT INTO uploaded_files (fileName, md5, remote_ip) VALUES (?,?,?)');
    stmt.run(originalFileName,fileName,0);
    stmt.finalize()

    response.write(JSON.stringify({'fileName':fileName}));
    response.statusCode = 200;
    response.end();
    return true;

}

// Handle static files
function serveStatic(response, pathname, postData) {
    if(!fs.existsSync('.'+pathname)) {
        console.log('ERROR: Unknown file.',pathname);
        return false;
    }
    var mimeType = mime.lookup('.'+pathname);
    response.writeHead(200, {'Content-Type': mimeType});
    response.end(fs.readFileSync('.' + pathname));
    return true;

}

// Handle download requests
function serveDownload(response, pathname, postData) {
    pathArr = pathname.split('/');
    md5 = pathArr[pathArr.length-1].replace(/[^a-f0-9]/g,'');

    var query = "SELECT fileName FROM uploaded_files WHERE md5 = ?";
    return db.get(query, [md5], function(err, row) {

        if (null == row || null == row.fileName) {
            console.log('ERROR: Unknown hash.',md5);
            return false;
        }

        var fileName = config.upload_dir+'/'+md5;
        if (!fs.existsSync(fileName)) {
            console.log('ERROR: No such file.',fileName);
            return false;
        }

        var realFileName = row.fileName;
        var mimeType = mime.lookup(fileName);
        response.writeHead(200, {'Content-Type': mimeType, 'Content-Disposition': 'attachment; filename='+realFileName});
        response.end(fs.readFileSync(fileName));
        return true;

    });

}

// return the correct function based on path
function getHandler(path) {
    return handlers[path];
}

exports.getHandler = getHandler;
