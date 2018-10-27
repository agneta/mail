const Promise = require('bluebird');
const _ = require('lodash');

module.exports = function(locals) {
  return function(path, session, callback) {
    path = path.toLowerCase();
    let uidList = [];
    console.log(path);
    Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Box._forEach({
          userId: session.user.id,
          where: {
            path: path
          },
          callback: function(data) {
            return locals.app.models.Mail_Item_Box.find({
              where: {
                mailboxId: data.mailBox.id
              }
            }).then(function(result) {
              var uids = _.map(result, 'itemId');
              uidList = _.concat(uidList, uids);
              _.uniq(uidList);
            });
          }
        });
      })
      .then(function() {
        console.log(uidList);
        return {
          path: path,
          uidList: uidList
        };
      })
      .asCallback(callback);
  };
};
