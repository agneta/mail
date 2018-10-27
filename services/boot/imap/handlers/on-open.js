const Promise = require('bluebird');
const _ = require('lodash');

module.exports = function(locals) {
  return function(path, session, callback) {
    path = path.toLowerCase();
    var pathParsed = path.split('/');
    let mailAccountName = pathParsed.shift();
    let mailAccountEmail = `${mailAccountName}@${locals.server.domain}`;
    let mailboxPath = pathParsed.join('/');
    return Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Account.findOne({
          where: {
            email: mailAccountEmail
          }
        }).then(function(mailAccount) {
          if (!mailAccount) {
            return 'NONEXISTENT';
          }

          return locals.app.models.Mail_Box.findOne({
            where: {
              path: mailboxPath,
              accountId: mailAccount.id
            }
          }).then(function(mailBox) {
            if (!mailBox) {
              return 'NONEXISTENT';
            }

            return locals.app.models.Mail_Item_Box.find({
              where: {
                mailboxId: mailBox.id
              }
            }).then(function(mailItems) {
              var uidList = _.map(mailItems, 'itemId');
              var result = {
                _id: mailBox.id,
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
