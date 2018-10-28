const Promise = require('bluebird');
module.exports = function(locals) {
  return function(query, session, callback) {
    query = query || {};
    let result = [];

    return Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Box._forEach({
          userId: session.user.id,
          where: query.wehere,
          callback: function(data) {
            result.push(data.mailbox);
          }
        });
      })
      .then(function() {
        console.log(result);
        return result;
      })
      .asCallback(callback);
  };
};
