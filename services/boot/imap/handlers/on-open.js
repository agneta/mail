const Promise = require('bluebird');

module.exports = function() {
  return function(path, session, callback) {
    console.log(path);
    Promise.resolve()
      .then(function() {
        return {};
      })
      .asCallback(callback);
  };
};
