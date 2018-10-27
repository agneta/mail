'use strict';

const config = require('../config');
const IMAPServerModule = require('@agneta/imap');
const imapHandler = IMAPServerModule.imapHandler;
const util = require('util');
const Promise = require('bluebird');
const LimitedFetch = require('../limited-fetch');

module.exports = function(locals) {
  return function(mailbox, options, session, callback) {
    let limit;
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
      .then(function(mailboxData) {
        if (!mailboxData) {
          return 'NONEXISTENT';
        }

        return locals.userCache.get(
          session.user.id,
          'imapMaxDownload',
          (config.imap.maxDownloadMB || 10) * 1024 * 1024
        );
      })
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
            'Download was rate limited. Check again in ' + res.ttl + ' seconds'
          );
          err.response = 'NO';
          return Promise.reject(err);
        }

        let rowCount = 0;

        let fields = {
          uid: true,
          modseq: true,
          idate: true,
          flags: true,
          envelope: true,
          bodystructure: true,
          size: true
        };

        if (!options.metadataOnly) {
          fields.html = true;
          fields.text = true;
          fields.attachments = true;
        }
        console.log(options);
        return Promise.map(options.messages, function(messageId) {
          return locals.app.models.Mail_Item.findById(messageId, {
            fields: fields
          }).then(function(message) {
            if (!message) {
              return;
            }

            console.log(message);

            return new Promise(function(resolve, reject) {
              let markAsSeen =
                options.markAsSeen && !message.flags.includes('\\Seen');
              if (markAsSeen) {
                message.flags.unshift('\\Seen');
              }

              let stream = imapHandler.compileStream(
                session.formatResponse('FETCH', message.uid, {
                  query: options.query,
                  values: session.getQueryResponse(options.query, message, {
                    logger: locals.server.logger,
                    fetchOptions: {},
                    attachmentStorage: locals.attachmentStorage,
                    acceptUTF8Enabled: session.isUTF8Enabled()
                  })
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
                reject(err);
              });

              let limiter = new LimitedFetch({
                key: 'idw:' + session.user.id,
                ttlcounter: locals.counters.ttlcounterAsync,
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

                return message
                  .updateAttributes({
                    flags: message.flags.concat(['\\Seen'])
                  })
                  .then(resolve)
                  .catch(reject);

                /*
                            return locals.server.notifier
                              .addEntries(mailboxData, [
                                {
                                  command: 'FETCH',
                                  ignore: session.id,
                                  uid: message.uid,
                                  flags: message.flags,
                                  message: message._id,
                                  unseenChange: true
                                }
                              ])
                              .then(function() {
                                return locals.server.notifier.fire(
                                  session.user.id
                                );
                              });*/
              });
            });
          });
        });
      })
      .asCallback(callback);
  };
};
