var isemail = require('isemail');
const Promise = require('bluebird');
const config = require('../config');

module.exports = function(locals) {
  const allocateConnection = Promise.promisify(
    locals.server.notifier.allocateConnection,
    {
      context: locals.server.notifier
    }
  );

  return function(login, session, callback) {
    //console.log(login);
    let username = (login.username || '').toString().trim();
    let email = username;
    if (!isemail.validate(email)) {
      email = `${email}@agneta.io`;
    }
    let account;

    Promise.resolve()
      .then(function() {
        return locals.app.models.Account.findOne({
          where: {
            email: email
          },
          fields: {
            id: true
          }
        });
      })
      .then(function(_account) {
        account = _account;

        if (!account) {
          let err = new Error('Account not found');
          err.response = 'NO';
          return Promise.reject(err);
        }

        return locals.app.models.Mail_Account_User.count({
          userId: account.id
        });
      })
      .then(function(count) {
        if (!count) {
          let err = new Error('No mail accounts attached to this user');
          err.response = 'NO';
          return Promise.reject(err);
        }
        return locals.app.models.Account.signIn(
          email,
          undefined,
          login.password
        );
      })
      .then(function() {
        return locals.userCache.get(
          account.id,
          'imapMaxConnections',
          config.imap.maxConnections || 15
        );
      })
      .then(function(limit) {
        return allocateConnection({
          service: 'imap',
          session,
          user: account.id,
          limit
        });
      })
      .then(function(success) {
        if (!success) {
          let err = new Error('[ALERT] Too many simultaneous connections.');
          err.response = 'NO';
          return Promise.reject(err);
        }
        return {
          user: {
            id: account.id,
            username: username
          }
        };
      })
      .asCallback(callback);
  };
};
