function respondWithHTTPCode(response, code) {
	response.writeHead(code, {'Content-Type': 'text/plain'});
	response.end();
}

function get_dir(pathString) {
	pathTmp = pathString.split('/');
	pathArray = [];

	pathTmp.forEach(function(dir) {
		if (dir != '') { pathArray.push(dir); }
	});

	if (pathArray.length == 0) {
		pathArray.push('home');
	}

	return pathArray[0];
}

function route(handle, pathname, response, postData) {
	var result = false;

	if ('function' === typeof handle(get_dir(pathname))) {
		result = handle(get_dir(pathname))(response, pathname, postData);
	}

	if (!result) {
		respondWithHTTPCode(response, 404);
	}

}

exports.route = route;