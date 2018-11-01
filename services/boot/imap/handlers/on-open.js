const Promise = require('bluebird');
const _ = require('lodash');

module.exports = function(locals) {
  return function(path, session, callback) {
    return Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Box._get({
          path: path,
          session: session
        }).then(function(mailbox) {
          if (!mailbox) {
            return 'NONEXISTENT';
          }

          return locals.app.models.Mail_Item.find({
            where: {
              mailboxId: mailbox.id
            },
            fields: {
              uid: true
            }
          }).then(function(mailItems) {
            var uidList = _.map(mailItems, 'uid');
            var result = {
              _id: mailbox.id,
              uidList: uidList
            };
            return result;
          });
        });
      })
      .asCallback(callback);
  };
};
