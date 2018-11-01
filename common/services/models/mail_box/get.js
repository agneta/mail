module.exports = function(Model, app) {
  Model._get = function(options) {
    var pathParsed = options.path.split('/');

    return app.models.Mail_Account.findOne({
      where: {
        name: pathParsed[1]
      }
    }).then(function(mailAccount) {
      if (!mailAccount) {
        return false;
      }

      return app.models.Mail_Account_User.findOne({
        where: {
          accountId: mailAccount.id,
          userId: options.session.user.id
        }
      }).then(function(result) {
        if (!result) {
          return false;
        }

        return app.models.Mail_Box.findOne({
          where: {
            path: options.path,
            mailAccountId: mailAccount.accountId
          }
        });
      });
    });
  };
};
