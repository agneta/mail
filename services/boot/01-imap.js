const Promise = require('bluebird');

module.exports = function(app) {
  if (!app.httpServer) {
    return;
  }

  return new Promise(function(resolve, reject) {
    require('./imap')(app, function(err, result) {
      if (err) {
        return reject(err);
      }

      resolve(result);
    });
  });
};
