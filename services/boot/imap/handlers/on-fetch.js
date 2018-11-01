'use strict';

const config = require('../config');
const IMAPServerModule = require('@agneta/imap');
const imapHandler = IMAPServerModule.imapHandler;
const util = require('util');
const Promise = require('bluebird');
const _ = require('lodash');
const LimitedFetch = require('../limited-fetch');
const MailComposer = require('nodemailer/lib/mail-composer');

module.exports = function(locals) {
  return function(mailbox, options, session, callback) {
    let limit;
    let mailboxData;
    locals.server.logger.debug(
      {
        tnx: 'fetch',
        cid: session.id
      },
      '[%s] Requested FETCH for "%s"',
      session.id,
      mailbox
    );
    //console.log(mailbox, options);
    return Promise.resolve()
      .then(function() {
        return locals.app.models.Mail_Box.findById(mailbox);
      })
      .then(function(_mailboxData) {
        mailboxData = _mailboxData;
        if (!mailboxData) {
          return 'NONEXISTENT';
        }

        return locals.app.models.Mail_Account_User.findOne({
          where: {
            accountId: mailboxData.mailAccountId,
            userId: session.user.id
          }
        }).then(function(result) {
          if (!result) {
            return 'NONEXISTENT';
          }

          return locals.userCache
            .get(
              session.user.id,
              'imapMaxDownload',
              (config.imap.maxDownloadMB || 10) * 1024 * 1024
            )
            .then(function(_limit) {
              limit = _limit;
              return locals.counters.ttlcounterAsync(
                'idw:' + session.user.id,
                0,
                limit,
                false
              );
            })
            .then(function(res) {
              if (!res.success) {
                let err = new Error(
                  'Download was rate limited. Check again in ' +
                    res.ttl +
                    ' seconds'
                );
                err.response = 'NO';
                return Promise.reject(err);
              }

              let rowCount = 0;

              let fields = {
                id: true,
                uid: true,
                modseq: true,
                date: true,
                flags: true,
                headers: true
              };

              if (!options.metadataOnly) {
                fields.html = true;
                fields.text = true;
              }
              //console.log(options, options.messages.length);
              return Promise.map(
                options.messages,
                function(messageUid) {
                  let values = {
                    pending: messageUid
                  };

                  let where = {
                    mailboxId: mailboxData.id,
                    uid: messageUid
                  };

                  //console.log(where);

                  return locals.app.models.Mail_Item.findOne({
                    where: where,
                    fields: fields
                  })
                    .then(function(message) {
                      if (!message) {
                        return;
                      }
                      var mailOptions = _.pick(message.__data, [
                        'html',
                        'text',
                        'headers'
                      ]);
                      ['to', 'from', 'cc', 'bcc', 'sender'].forEach(function(
                        prop
                      ) {
                        var header = mailOptions.headers[prop];
                        if (!header) {
                          return;
                        }
                        mailOptions[prop] = header.value;
                        mailOptions.headers[prop] = undefined;
                      });

                      if (!mailOptions.sender) {
                        mailOptions.sender = mailOptions.from;
                      }

                      //console.log(mailOptions);

                      return composeMail(mailOptions).then(function(mailRaw) {
                        /*
                        require('mailparser')
                          .simpleParser(mailRaw)
                          .then(function(parsed) {
                            console.log('test check', parsed);
                          });*/

                        let mimeTree = locals.app.models.Mail_Item.indexer.parseMimeTree(
                          mailRaw
                        );

                        let messageData = {
                          uid: message.uid,
                          idate: message.date,
                          mimeTree: mimeTree
                        };

                        _.extend(
                          messageData,
                          _.pick(message.__data, ['modseq', 'flags'])
                        );

                        //console.log(messageData);

                        return new Promise(function(resolve, reject) {
                          let markAsSeen =
                            options.markAsSeen &&
                            !message.flags.includes('\\Seen');

                          values = session.getQueryResponse(
                            options.query,
                            messageData,
                            {
                              logger: locals.server.logger,
                              fetchOptions: {},
                              //attachmentStorage: locals.attachmentStorage,
                              acceptUTF8Enabled: session.isUTF8Enabled()
                            }
                          );
                          let stream = imapHandler.compileStream(
                            session.formatResponse('FETCH', message.uid, {
                              query: options.query,
                              values: values
                            })
                          );

                          stream.description = util.format(
                            '* FETCH #%s uid=%s size=%sB ',
                            ++rowCount,
                            message.uid,
                            message.size
                          );

                          stream.once('error', err => {
                            err.processed = true;
                            locals.server.logger.error(
                              {
                                err,
                                tnx: 'fetch',
                                cid: session.id
                              },
                              '[%s] FETCHFAIL %s. %s',
                              session.id,
                              messageData.uid,
                              err.message
                            );

                            session.socket.end(
                              '\n* BYE Internal Server Error\n'
                            );
                            reject(err);
                          });

                          let limiter = new LimitedFetch({
                            key: 'idw:' + session.user.id,
                            ttlcounter: locals.counters.ttlcounter,
                            maxBytes: limit
                          });
                          stream.pipe(limiter);

                          // send formatted response to socket
                          session.writeStream.write(limiter, () => {
                            if (!markAsSeen) {
                              return resolve();
                            }

                            locals.server.logger.debug(
                              {
                                tnx: 'flags',
                                cid: session.id
                              },
                              '[%s] UPDATE FLAGS for "%s"',
                              session.id,
                              message.uid
                            );

                            var flags = message.flags.concat(['\\Seen']);
                            flags = _.uniq(flags);
                            return message
                              .updateAttributes({
                                flags: flags
                              })
                              .then(function() {
                                return locals.server.notifier.addEntries(
                                  mailboxData,
                                  [
                                    {
                                      command: 'FETCH',
                                      ignore: session.id,
                                      uid: message.uid,
                                      flags: message.flags,
                                      message: message.id,
                                      unseenChange: true
                                    }
                                  ]
                                );
                              })
                              .then(function() {
                                return locals.server.notifier.fire(
                                  session.user.id
                                );
                              })
                              .then(resolve)
                              .catch(reject);
                          });
                        });
                      });
                    })
                    .then(function() {
                      return values;
                    });
                },
                {
                  concurrency: 4
                }
              ).then(function() {
                //console.log(result);
                return true;
              });
            });
        });
      })
      .asCallback(callback);
  };
};

function composeMail(mailOptions) {
  return new Promise(function(resolve, reject) {
    new MailComposer(mailOptions).compile().build(function(err, result) {
      if (err) {
        return reject(err);
      }
      resolve(result);
    });
  });
}
