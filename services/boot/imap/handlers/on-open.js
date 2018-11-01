const Promise = require('bluebird');
const _ = require('lodash');

module.exports = function(locals) {
  return function(path, session, callback) {
    var pathParsed = path.split('/');
    return Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Account.findOne({
          where: {
            name: pathParsed[1]
          }
        }).then(function(mailAccount) {
          if (!mailAccount) {
            return 'NONEXISTENT';
          }

          return locals.app.models.Mail_Account_User.findOne({
            where: {
              accountId: mailAccount.id,
              userId: session.user.id
            }
          })
            .then(function(result) {
              if (!result) {
                return 'NONEXISTENT';
              }

              return locals.app.models.Mail_Box.findOne({
                where: {
                  path: path,
                  mailAccountId: mailAccount.accountId
                }
              });
            })
            .then(function(mailbox) {
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
                console.log(result);
                return result;
              });
            });
        });
      })
      .asCallback(callback);
  };
};
