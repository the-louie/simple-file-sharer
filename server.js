var config = require('./config'),
    http = require('http'),
    url = require('url');

function start(route, handle) {

	function onRequest(request, response) {

		var pathname = url.parse(request.url).pathname,
			postData = '';

		request.setEncoding('utf8');

		request.addListener('data', function (postDataChunk) {
			postData += postDataChunk;
		});

		request.addListener('end', function () {
			route(handle, pathname, response, postData, request);
		});
	}

	http.createServer(onRequest).listen(config.port, config.ip);
}

exports.start = start;