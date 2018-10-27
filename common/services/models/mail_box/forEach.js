const Promise = require('bluebird');
const _ = require('lodash');
module.exports = function(Model, app) {
  Model._forEach = function(options) {
    return Promise.resolve()
      .then(function() {
        return app.models.Mail_Account_User.find({
          where: {
            userId: options.userId
          },
          fields: {
            accountId: true
          }
        });
      })
      .then(function(throughAccounts) {
        return Promise.map(throughAccounts, function(throughAccount) {
          let mailAccount;
          return app.models.Mail_Account.findById(
            throughAccount.accountId
          ).then(function(_mailAccount) {
            mailAccount = _mailAccount;
            return app.models.Mail_Box.find({
              where: _.extend({}, options.where, {
                accountId: mailAccount.id
              })
            }).then(function(mailBoxes) {
              return Promise.map(mailBoxes, function(mailBox) {
                return options.callback({
                  mailAccount: mailAccount,
                  mailBox: mailBox
                });
              });
            });
          });
        });
      });
  };
};
