'use strict';

const config = require('wild-config');
const IMAPServerModule = require('@agneta/imap');
const imapHandler = IMAPServerModule.imapHandler;
const util = require('util');
const Promise = require('bluebird');

module.exports = function(locals) {
  return function(mailbox, options, session, callback) {
    locals.server.logger.debug(
      {
        tnx: 'fetch',
        cid: session.id
      },
      '[%s] Requested FETCH for "%s"',
      session.id,
      mailbox
    );
    console.log(mailbox, options);
    return Promise.resolve()
      .then(function() {
        return;
        return db.database.collection('mailboxes').findOne(
          {
            _id: mailbox
          },
          (err, mailboxData) => {
            if (err) {
              return callback(err);
            }
            if (!mailboxData) {
              return callback(null, 'NONEXISTENT');
            }

            userCache.get(
              session.user.id,
              'imapMaxDownload',
              (config.imap.maxDownloadMB || 10) * 1024 * 1024,
              (err, limit) => {
                if (err) {
                  return callback(err);
                }

                messageHandler.counters.ttlcounter(
                  'idw:' + session.user.id,
                  0,
                  limit,
                  false,
                  (err, res) => {
                    if (err) {
                      return callback(err);
                    }
                    if (!res.success) {
                      let err = new Error(
                        'Download was rate limited. Check again in ' +
                          res.ttl +
                          ' seconds'
                      );
                      err.response = 'NO';
                      return callback(err);
                    }

                    let projection = {
                      uid: true,
                      modseq: true,
                      idate: true,
                      flags: true,
                      envelope: true,
                      bodystructure: true,
                      size: true
                    };

                    if (!options.metadataOnly) {
                      projection.mimeTree = true;
                    }

                    let query = {
                      mailbox: mailboxData._id
                    };

                    if (options.changedSince) {
                      query = {
                        mailbox: mailboxData._id,
                        modseq: {
                          $gt: options.changedSince
                        }
                      };
                    }

                    let queryAll = false;
                    if (
                      options.messages.length !==
                      session.selected.uidList.length
                    ) {
                      // do not use uid selector for 1:*
                      query.uid = tools.checkRangeQuery(options.messages);
                    } else {
                      // 1:*
                      queryAll = true;
                      // uid is part of the sharding key so we need it somehow represented in the query
                      query.uid = {
                        $gt: 0,
                        $lt: mailboxData.uidNext
                      };
                    }

                    let isUpdated = false;
                    let updateEntries = [];
                    let notifyEntries = [];

                    let done = (...args) => {
                      if (updateEntries.length) {
                        return db.database.collection('messages').bulkWrite(
                          updateEntries,
                          {
                            ordered: false,
                            w: 1
                          },
                          () => {
                            updateEntries = [];
                            server.notifier.addEntries(
                              mailboxData,
                              notifyEntries,
                              () => {
                                notifyEntries = [];
                                server.notifier.fire(session.user.id);
                                return callback(...args);
                              }
                            );
                          }
                        );
                      }
                      if (isUpdated) {
                        server.notifier.fire(session.user.id);
                      }
                      return callback(...args);
                    };

                    let cursor = db.database
                      .collection('messages')
                      .find(query)
                      .project(projection)
                      .sort([['uid', 1]]);

                    let rowCount = 0;
                    let processNext = () => {
                      cursor.next((err, message) => {
                        if (err) {
                          return done(err);
                        }
                        if (!message) {
                          return cursor.close(() => {
                            done(null, true);
                          });
                        }

                        if (
                          queryAll &&
                          !session.selected.uidList.includes(message.uid)
                        ) {
                          // skip processing messages that we do not know about yet
                          return processNext();
                        }

                        let markAsSeen =
                          options.markAsSeen &&
                          !message.flags.includes('\\Seen');
                        if (markAsSeen) {
                          message.flags.unshift('\\Seen');
                        }

                        let stream = imapHandler.compileStream(
                          session.formatResponse('FETCH', message.uid, {
                            query: options.query,
                            values: session.getQueryResponse(
                              options.query,
                              message,
                              {
                                logger: server.logger,
                                fetchOptions: {},
                                database: db.database,
                                attachmentStorage:
                                  messageHandler.attachmentStorage,
                                acceptUTF8Enabled: session.isUTF8Enabled()
                              }
                            )
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
                          server.logger.error(
                            {
                              err,
                              tnx: 'fetch',
                              cid: session.id
                            },
                            '[%s] FETCHFAIL %s. %s',
                            session.id,
                            message._id,
                            err.message
                          );

                          session.socket.end('\n* BYE Internal Server Error\n');
                          return cursor.close(() => done());
                        });

                        let limiter = new LimitedFetch({
                          key: 'idw:' + session.user.id,
                          ttlcounter: messageHandler.counters.ttlcounter,
                          maxBytes: limit
                        });
                        stream.pipe(limiter);

                        // send formatted response to socket
                        session.writeStream.write(limiter, () => {
                          if (!markAsSeen) {
                            return processNext();
                          }

                          server.logger.debug(
                            {
                              tnx: 'flags',
                              cid: session.id
                            },
                            '[%s] UPDATE FLAGS for "%s"',
                            session.id,
                            message.uid
                          );

                          isUpdated = true;

                          updateEntries.push({
                            updateOne: {
                              filter: {
                                _id: message._id,
                                // include sharding key in query
                                mailbox: mailboxData._id,
                                uid: message.uid
                              },
                              update: {
                                $addToSet: {
                                  flags: '\\Seen'
                                },
                                $set: {
                                  unseen: false
                                }
                              }
                            }
                          });

                          notifyEntries.push({
                            command: 'FETCH',
                            ignore: session.id,
                            uid: message.uid,
                            flags: message.flags,
                            message: message._id,
                            unseenChange: true
                          });

                          if (updateEntries.length >= consts.BULK_BATCH_SIZE) {
                            return db.database.collection('messages').bulkWrite(
                              updateEntries,
                              {
                                ordered: false,
                                w: 1
                              },
                              err => {
                                updateEntries = [];
                                if (err) {
                                  return cursor.close(() => done(err));
                                }

                                server.notifier.addEntries(
                                  mailboxData,
                                  notifyEntries,
                                  () => {
                                    notifyEntries = [];
                                    server.notifier.fire(session.user.id);
                                    processNext();
                                  }
                                );
                              }
                            );
                          } else {
                            processNext();
                          }
                        });
                      });
                    };

                    processNext();
                  }
                );
              }
            );
          }
        );
      })
      .asCallback(callback);
  };
};
