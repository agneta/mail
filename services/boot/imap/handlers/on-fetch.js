'use strict';

const config = require('wild-config');
const IMAPServerModule = require('@agneta/imap');
const imapHandler = IMAPServerModule.imapHandler;
const util = require('util');
const Promise = require('bluebird');
const LimitedFetch = require('../limited-fetch');
const consts = require('@agneta/imap/lib/consts');

module.exports = function(locals) {
  const ttlcounter = Promise.promisify(locals.counters.ttlcounter, {
    context: locals.counters
  });

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
        return locals.app.models.Mail_Box.findById(mailbox).then(function(
          mailboxData
        ) {
          if (!mailboxData) {
            return 'NONEXISTENT';
          }

          locals.userCache.get(
            session.user.id,
            'imapMaxDownload',
            (config.imap.maxDownloadMB || 10) * 1024 * 1024,
            (err, limit) => {
              if (err) {
                return callback(err);
              }

              return locals.counters
                .ttlcounter('idw:' + session.user.id, 0, limit, false)
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
                          locals.server.notifier.addEntries(
                            mailboxData,
                            notifyEntries,
                            () => {
                              notifyEntries = [];
                              locals.server.notifier.fire(session.user.id);
                              return callback(...args);
                            }
                          );
                        }
                      );
                    }
                    if (isUpdated) {
                      locals.server.notifier.fire(session.user.id);
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
                        options.markAsSeen && !message.flags.includes('\\Seen');
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
                              logger: locals.server.logger,
                              fetchOptions: {},
                              attachmentStorage: locals.attachmentStorage,
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
                        locals.server.logger.error(
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
                        ttlcounter: ttlcounter,
                        maxBytes: limit
                      });
                      stream.pipe(limiter);

                      // send formatted response to socket
                      session.writeStream.write(limiter, () => {
                        if (!markAsSeen) {
                          return processNext();
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

                              locals.server.notifier.addEntries(
                                mailboxData,
                                notifyEntries,
                                () => {
                                  notifyEntries = [];
                                  locals.server.notifier.fire(session.user.id);
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
                });
            }
          );
        });
      })
      .asCallback(callback);
  };
};
