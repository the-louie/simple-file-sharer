var config   = require('./config'),
    mime     = require('mime'),
    crypto   = require('crypto'),
    sqlite   = require('sqlite3').verbose(),
    fs       = require('fs'),
    url      = require('url'),
    qs       = require('qs'),

    db       = new sqlite.Database(config.db_name),

    handlers = {
        'home'       : serveHome,
        'upload'     : serveUploadChunks,
        'merge'      : serveUploadMerge,
        'static'     : serveStatic,
        'favicon.ico': serveFavicon,
        'd'          : serveDownload
    };

// Create table if it doesn't already exist.
db.run("CREATE TABLE IF NOT EXISTS uploaded_files (fid INTEGER PRIMARY KEY AUTOINCREMENT, fileName TEXT, sha TEXT, timestamp INTEGER DEFAULT (strftime('%s', 'now')), remote_ip INTEGER)");

// Serve / and /home
function serveHome(response, pathname, postData, request) {
    response.writeHead(200, {'Content-Type': 'text/html'});
    response.end(fs.readFileSync(config.static_dir+'/index.html'));
    return true;
}

// Serve favicon.ico
function serveFavicon(response, pathname, postData, request) {
    response.writeHead(200, {'Content-Type': 'image/x-icon'});
    response.end(fs.readFileSync(config.static_dir+'/favicon.ico'));
    return true;
}

// Handle uploads, save chunks to files
function serveUploadChunks(response, pathname, postData, request) {
    var queryStr          = url.parse(request['url']).query;
    var queryVars         = qs.parse(queryStr);

    // verify input, never trust the user
    if(!postData) { console.error("serveUploadChunks: postData failed"); response.statusCode = 431; response.end(); return false; }
    if(!queryVars) { console.error("serveUploadChunks: queryVars failed"); response.statusCode = 432; response.end(); return false; }
    if(!queryVars.uuid) { console.error("serveUploadChunks: uuid failed"); response.statusCode = 433; response.end(); return false; }
    if(!queryVars.chunkIndex) { console.error("serveUploadChunks: queryVars.chunkIndex failed"); response.statusCode = 434; response.end(); return false; }

    var uuid              = queryVars.uuid;
    var chunkID           = queryVars.chunkIndex;
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
    var fileBuffer = new Buffer(postData, 'binary');
    chunkFile = fs.createWriteStream(config.upload_dir+'/pending/'+fileName);
    chunkFile.write(fileBuffer);
    chunkFile.end();

    response.write(JSON.stringify({'fileName':fileName, 'chunk':chunkID}));
    response.statusCode = 200;
    response.end();

    return true;
}

// Handle uploads, save them to a file and add it to the database
function serveUploadMerge(response, pathname, postData, request) {
    var queryStr          = url.parse(request['url']).query;
    var queryVars         = qs.parse(queryStr);
    var remoteAddress     = request.connection.remoteAddress;

    // verify input, never trust the user
    if(!queryVars) { console.error("serveUploadChunks: queryVars failed"); response.statusCode = 441; response.end(); return false; }
    if(!queryVars.name) { console.error("serveUploadChunks: name failed"); response.statusCode = 442; response.end(); return false; }
    if(!queryVars.uuid) { console.error("serveUploadChunks: uuid failed"); response.statusCode = 443; response.end(); return false; }
    if(!queryVars.chunkCount) { console.error("serveUploadChunks: queryVars.chunkCount failed"); response.statusCode = 444; response.end(); return false; }

    var uuid              = queryVars.uuid;
    var chunk_count       = queryVars.chunkCount;
    var originalFileName  = queryVars.name;

    var fileName          = crypto.createHash('sha256').update(
                                originalFileName +
                                (new Date().getTime()) +
                                config.secret +
                                remoteAddress
                            ).digest("hex");

    console.log("Merging", fileName, "//", originalFileName);

    var query = "SELECT filename FROM uploaded_chunks WHERE uuid = ? ORDER BY chunk_id";
    var result_file = fs.createWriteStream(config.upload_dir+'/'+fileName);
    var file_list = [];
    db.all(query, [uuid], function(err, rows) {
        for (r in rows) {
            row = rows[r];
            var chunkFileName = row.filename;

            chunkData = fs.readFileSync(config.upload_dir+'/pending/'+chunkFileName);
            result_file.write(chunkData);


            file_list.push(config.upload_dir+'/pending/'+chunkFileName)
        }
        result_file.end(function() {
            for (i in file_list) {
                thisFile = file_list[i];
                fs.unlink(thisFile, function (err) {
                    if (err) throw err;
                });
            }
        });

        var stmt = db.prepare('DELETE FROM uploaded_chunks WHERE uuid = ?');
        stmt.run(uuid);
        stmt.finalize();

        var stmt = db.prepare('INSERT INTO uploaded_files (fileName, sha, remote_ip) VALUES (?,?,?)');
        stmt.run(originalFileName, fileName, remoteAddress);
        stmt.finalize();

        response.write(JSON.stringify({'fileName':fileName}));
        response.statusCode = 200;
        response.end();
    });

    return true;
}

// Handle static files
function serveStatic(response, pathname, postData, request) {
    if(!fs.existsSync('.'+pathname)) {
        console.log('ERROR: Unknown file.', pathname);
        return false;
    }
    var mimeType = mime.lookup('.'+pathname);
    response.writeHead(200, {'Content-Type': mimeType});
    response.end(fs.readFileSync('.' + pathname));
    return true;

}

// Handle download requests
function serveDownload(response, pathname, postData, request) {
    var pathArr = pathname.split('/');
    var sha = pathArr[pathArr.length-1].replace(/[^a-f0-9]/g,'');

    var query = "SELECT fileName FROM uploaded_files WHERE sha = ?";
    db.get(query, [sha], function(err, row) {
        console.log(row);
        if (null == row || null == row.fileName) {
            console.error('ERROR: Unknown hash.', sha);
            return false;
        }

        var fileName = config.upload_dir+'/'+sha;
        if (!fs.existsSync(fileName)) {
            console.error('ERROR: No such file.', fileName);
            return false;
        }

        var header = {};
        var realFileName = row.fileName;

        var mimeType = mime.lookup(realFileName);
        if (mimeType.split('/')[0] != 'image')
            header['Content-Disposition'] = 'attachment; filename=' + realFileName;

        header['Content-Type'] = mimeType;
        response.writeHead(200, header);
        response.end(fs.readFileSync(fileName));
        return true;
    });

    return true;

}

// return the correct function based on path
function getHandler(path) {
    return handlers[path];
}

exports.getHandler = getHandler;
