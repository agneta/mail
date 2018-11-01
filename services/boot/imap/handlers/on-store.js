const config = require('../config');
const imapTools = require('@agneta/imap/lib/imap-tools');
const base32 = require('base32.js');
const crypto = require('crypto');
const Promise = require('bluebird');

module.exports = function(locals) {
  return function(mailbox, update, session, callback) {
    console.log(mailbox, update);

    locals.server.logger.debug(
      {
        tnx: 'store',
        cid: session.id
      },
      '[%s] Updating messages in "%s"',
      session.id,
      mailbox
    );

    var Mail_Box = locals.app.models.Mail_Box;
    var Mail_Item = locals.app.models.Mail_Item;

    return Mail_Box.findById(mailbox)
      .then(function(mailboxData) {
        if (!mailboxData) {
          return 'NONEXISTENT';
        }

        let unseenChange = update.value.includes('\\Seen');

        let modified = [];

        let newModseq = false;
        function getModseq() {
          if (newModseq) {
            return newModseq;
          }

          mailboxData.modifyIndex++;

          return mailboxData.save().then(function(item) {
            newModseq = item.modifyIndex;
            return mailboxData.modifyIndex;
          });
        }

        let condstoreEnabled = !!session.selected.condstoreEnabled;
        let shouldExpunge = false;

        return Promise.map(
          update.messages,
          function(messageUid) {
            return Mail_Item.findOne({
              where: {
                uid: messageUid,
                mailboxId: mailbox
              },
              fields: {
                id: true,
                uid: true,
                flags: true,
                modseq: true
              }
            })
              .then(function(message) {
                // We have to process all messages one by one instead of just calling an update
                // for all messages as we need to know which messages were exactly modified,
                // otherwise we can't send flag update notifications and modify modseq values

                if (
                  update.unchangedSince &&
                  message.modseq > update.unchangedSince
                ) {
                  modified.push(message.uid);
                  return;
                }

                let flagsupdate = false; // query object for updates
                let updated = false;
                let existingFlags = message.flags.map(flag =>
                  flag.toLowerCase().trim()
                );
                switch (update.action) {
                  case 'set':
                    // check if update set matches current or is different
                    if (
                      // if length does not match
                      existingFlags.length !== update.value.length ||
                      // or a new flag was found
                      update.value.filter(
                        flag =>
                          !existingFlags.includes(flag.toLowerCase().trim())
                      ).length
                    ) {
                      updated = true;
                    }

                    message.flags = [].concat(update.value);

                    // set flags
                    if (updated) {
                      flagsupdate = {
                        flags: message.flags
                      };

                      if (message.flags.includes('\\Deleted')) {
                        shouldExpunge = true;
                      }

                      if (
                        !['\\Junk', '\\Trash'].includes(
                          mailboxData.specialUse
                        ) &&
                        !message.flags.includes('\\Deleted')
                      ) {
                        flagsupdate.searchable = true;
                      } else {
                        flagsupdate.searchable = false;
                      }
                    }
                    break;

                  case 'add': {
                    let newFlags = [];
                    message.flags = message.flags.concat(
                      update.value.filter(flag => {
                        if (
                          !existingFlags.includes(flag.toLowerCase().trim())
                        ) {
                          updated = true;
                          newFlags.push(flag);
                          return true;
                        }
                        return false;
                      })
                    );

                    // add flags
                    if (updated) {
                      flagsupdate = {
                        $addToSet: {
                          flags: {
                            $each: newFlags
                          }
                        }
                      };

                      if (
                        newFlags.includes('\\Seen') ||
                        newFlags.includes('\\Flagged') ||
                        newFlags.includes('\\Deleted') ||
                        newFlags.includes('\\Draft')
                      ) {
                        flagsupdate = {};
                        if (newFlags.includes('\\Deleted')) {
                          shouldExpunge = true;
                          flagsupdate = {
                            undeleted: false
                          };
                          flagsupdate.searchable = false;
                        }
                      }
                    }
                    break;
                  }

                  case 'remove': {
                    // We need to use the case of existing flags when removing
                    let oldFlags = [];
                    let flagsUpdates = update.value.map(flag =>
                      flag.toLowerCase().trim()
                    );
                    message.flags = message.flags.filter(flag => {
                      if (!flagsUpdates.includes(flag.toLowerCase().trim())) {
                        return true;
                      }
                      oldFlags.push(flag);
                      updated = true;
                      return false;
                    });

                    // remove flags
                    if (updated) {
                      flagsupdate = {
                        $pull: {
                          flags: {
                            $in: oldFlags
                          }
                        }
                      };
                      if (
                        oldFlags.includes('\\Seen') ||
                        oldFlags.includes('\\Flagged') ||
                        oldFlags.includes('\\Deleted') ||
                        oldFlags.includes('\\Draft')
                      ) {
                        flagsupdate = {};
                        if (oldFlags.includes('\\Deleted')) {
                          if (
                            !['\\Junk', '\\Trash'].includes(
                              mailboxData.specialUse
                            )
                          ) {
                            flagsupdate.searchable = true;
                          }
                        }
                      }
                    }
                    break;
                  }
                }

                if (updated) {
                  return getModseq().then(function(modseq) {
                    if (!update.silent || condstoreEnabled) {
                      // print updated state of the message
                      session.writeStream.write(
                        session.formatResponse('FETCH', message.uid, {
                          uid: update.isUid ? message.uid : false,
                          flags: message.flags,
                          modseq: condstoreEnabled ? modseq : false
                        })
                      );
                    }

                    flagsupdate.modseq = modseq;

                    return message
                      .updateAttributes(flagsupdate)
                      .then(function() {
                        return locals.server.notifier
                          .addEntries(mailboxData, [
                            {
                              command: 'FETCH',
                              ignore: session.id,
                              uid: message.uid,
                              flags: message.flags,
                              message: message._id,
                              modseq,
                              unseenChange
                            }
                          ])
                          .then(function() {
                            return locals.server.notifier.fire(session.user.id);
                          });
                      });
                  });
                }
              })
              .then(function() {
                if (config.imap.autoExpunge && shouldExpunge) {
                  // shcedule EXPUNGE command for current folder
                  let expungeOptions = {
                    // create new temporary session so it would not mix with the active one
                    id:
                      'auto.' +
                      base32.encode(crypto.randomBytes(10)).toLowerCase(),
                    user: {
                      id: session.user.id,
                      username: session.user.username
                    }
                  };
                  return locals.server
                    .onExpunge(mailbox, { silent: true }, expungeOptions)
                    .then(function() {
                      return false;
                    });
                }
                return updateMailboxFlags(mailboxData, update);
              });
          },
          {
            concurrency: 4
          }
        ).then(function() {
          return true;
        });
      })
      .asCallback(callback);

    function updateMailboxFlags(mailbox, update) {
      if (update.action === 'remove') {
        // we didn't add any new flags, so there's nothing to update
        return;
      }

      let mailboxFlags = imapTools.systemFlags
        .concat(mailbox.flags || [])
        .map(flag => flag.trim().toLowerCase());
      let newFlags = [];

      // find flags that are not listed with mailbox
      update.value.forEach(flag => {
        // limit mailbox flags by 100
        if (mailboxFlags.length + newFlags.length >= 100) {
          return;
        }
        // if mailbox does not have such flag, then add it
        if (!mailboxFlags.includes(flag.toLowerCase().trim())) {
          newFlags.push(flag);
        }
      });

      // nothing new found
      if (!newFlags.length) {
        return;
      }

      // found some new flags not yet set for mailbox
      // FIXME: Should we send unsolicited FLAGS and PERMANENTFLAGS notifications? Probably not

      return Mail_Box.replaceById(mailbox.id, {
        $addToSet: {
          flags: {
            $each: newFlags
          }
        }
      });
    }
  };
};
