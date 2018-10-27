const Promise = require('bluebird');
module.exports = function(locals) {
  return function(query, session, callback) {
    query = query || {};
    let result = [];

    Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Box._forEach({
          userId: session.user.id,
          where: query.wehere,
          callback: function(data) {
            var username = data.mailAccount.email.split('@')[0];
            data.mailBox.path = `${username}/${data.mailBox.path}`;
            result.push(data.mailBox);
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
