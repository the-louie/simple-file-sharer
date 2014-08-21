var server = require('./server'),
    handlers = require('./handlers'),
    router = require('./router');

console.log((new Date()).toJSON() + ' Starting server...');
server.start(router.route, handlers.getHandler);