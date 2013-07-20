var server = require('./server'),
    handlers = require('./handlers'),
    router = require('./router');

 server.start(router.route, handlers.getHandler);