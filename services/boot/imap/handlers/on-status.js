const Promise = require('bluebird');

module.exports = function(locals) {
  return function(path, session, callback) {
    locals.server.logger.debug(
      {
        tnx: 'status',
        cid: session.id
      },
      '[%s] Requested status for "%s"',
      session.id,
      path
    );
    return Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Box._get({
          path: path,
          session: session
        });
      })
      .then(function(mailbox) {
        if (!mailbox) {
          return 'NONEXISTENT';
        }

        let total;

        return locals.app.models.Mail_Item.count({
          mailboxId: mailbox.id,
          uid: {
            gt: 0,
            lt: mailbox.uidNext
          }
        })
          .then(function(_total) {
            total = _total;
            return locals.app.models.Mail_Item.count({
              mailboxId: mailbox.id,
              unseen: true,
              uid: {
                gt: 0,
                lt: mailbox.uidNext
              }
            });
          })
          .then(function(unseen) {
            return {
              messages: total,
              uidNext: mailbox.uidNext,
              uidValidity: mailbox.uidValidity,
              unseen
            };
          });
      })
      .asCallback(callback);
  };
};
