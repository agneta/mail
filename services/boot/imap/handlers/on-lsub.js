const Promise = require('bluebird');
module.exports = function(locals) {
  return function(query, session, callback) {
    Promise.resolve()
      .then(function() {
        return locals.server.onList({}, session);
      })
      .asCallback(callback);
  };
};
