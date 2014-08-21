function respondWithHTTPCode(response, code) {
	response.writeHead(code, {'Content-Type': 'text/plain'});
	response.end();
}

function get_dir(pathString) {
	var pathTmp = pathString.split('/');
	var pathArray = [];

	pathTmp.forEach(function(dir) {
		if (dir != '') { pathArray.push(dir); }
	});

	if (pathArray.length == 0) {
		pathArray.push('home');
	}

	return pathArray[0];
}

function route(handle, pathname, response, postData, request) {
	var result = false;

	if ('function' === typeof handle(get_dir(pathname))) {
		console.log((new Date()).toJSON() + ' Handling request for', pathname, 'from', request.connection.remoteAddress);
		result = handle(get_dir(pathname))(response, pathname, postData, request);
	}

	if (!result) {
		console.error((new Date()).toJSON() + ' ERROR: request failed. ', pathname);
		//respondWithHTTPCode(response, 404);
		response.writeHead(302, {
		  'Location': '/'
		});
		response.end();
	}

}

exports.route = route;