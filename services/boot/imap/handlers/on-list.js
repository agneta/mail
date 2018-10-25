const Promise = require('bluebird');
module.exports = function() {
  return function(query, session, callback) {
    console.log(query);
    Promise.resolve()
      .then(function() {
        return [];
      })
      .asCallback(callback);
  };
};
