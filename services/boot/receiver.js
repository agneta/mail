const INTERVAL = 1000 * 6;
const Promise = require('bluebird');
const urljoin = require('url-join');
const path = require('path');
const simpleParser = require('mailparser').simpleParser;
const _ = require('lodash');
const stream = require('stream');
const jobName = 'emailReceive';

module.exports = function(app) {
  var config = app.get('storage');
  var domain = app.web.project.config.domain.production;
  if (!config) {
    return;
  }

  app.queue.add(jobName, null, {
    jobId: 1,
    repeat: {
      every: INTERVAL
    }
  });

  app.queue.process(jobName, rotateCheck);

  function rotateCheck() {
    return Promise.resolve()
      .then(function() {
        return app.storage.listObjects({
          Bucket: config.buckets.email,
          Prefix: 'incoming/'
        });
      })
      .then(function(result) {
        //console.log(result);

        return Promise.map(
          result.Contents,
          function(item) {
            var KeyParsed = path.parse(item.Key);
            var storageKey = KeyParsed.name;
            var mailItem = null;
            var emailParsed = null;
            var emailProps = null;

            return Promise.resolve()
              .then(function() {
                return app.storage.getObjectStream({
                  Bucket: config.buckets.email,
                  Key: item.Key
                });
              })
              .then(function(stream) {
                return simpleParser(stream);
              })
              .then(function(_emailParsed) {
                emailParsed = _emailParsed;

                let from = emailParsed.from || {};
                let to = emailParsed.to || {};
                let cc = emailParsed.cc || {};
                let replyTo = emailParsed['reply-to'] || {};
                let headers = _.extend({}, emailParsed.headers);
                _.omit(headers, [
                  'from',
                  'to',
                  'cc',
                  'reply-to',
                  'return-path',
                  'subject'
                ]);
                console.log(headers);
                emailProps = {
                  from: from.value,
                  to: to.value,
                  cc: cc.value,
                  replyTo: replyTo.value,
                  storageKey: storageKey,
                  headers: headers,
                  spam: emailParsed.headers['x-ses-spam-verdict'] == 'PASS',
                  infected:
                    emailParsed.headers['x-ses-virus-verdict'] == 'PASS',
                  subject: emailParsed.subject,
                  date: emailParsed.date,
                  html: emailParsed.html || emailParsed.textAsHtml,
                  text: emailParsed.text,
                  type: 'received',
                  attachments: _.map(emailParsed.attachments, function(
                    attachment
                  ) {
                    return _.pick(attachment, [
                      'filename',
                      'contentType',
                      'size'
                    ]);
                  })
                };

                return app.models.Mail_Item.findOrCreate(
                  {
                    where: {
                      storageKey: storageKey
                    }
                  },
                  emailProps
                );
              })
              .then(function(result) {
                if (result[1]) {
                  //created
                  return result[0];
                }
                return result[0].updateAttributes(emailProps);
              })
              .then(function(_mailItem) {
                mailItem = _mailItem;

                if (mailItem.infected) {
                  return;
                }

                return Promise.map(emailParsed.attachments, function(
                  attachment
                ) {
                  var location = urljoin(
                    'email',
                    'attachments',
                    mailItem.id + '',
                    attachment.filename
                  );
                  return app.models.Media_Private.__get({
                    location: location,
                    fields: {
                      id: true
                    }
                  }).then(function(mediaItem) {
                    if (mediaItem) {
                      // Skip: Media exists
                      return;
                    }
                    var bufferStream = new stream.PassThrough();
                    bufferStream.end(attachment.content);

                    return app.models.Media_Private.__sendFile({
                      location: location,
                      mimetype: attachment.contentType,
                      stream: bufferStream
                    });
                  });
                });
              })
              .then(function() {
                return Promise.map(
                  ['to', 'from', 'cc', 'reply-to'],
                  function(type) {
                    return checkContacts(type);
                  },
                  {
                    concurrency: 1
                  }
                );

                function checkContacts(type) {
                  var contacts = emailParsed[type];
                  return Promise.resolve().then(function() {
                    if (!contacts) {
                      return;
                    }
                    contacts = contacts.value;
                    return Promise.map(
                      contacts,
                      function(contact) {
                        //console.log(contact);
                        let contactName;
                        if (contact.name.length) {
                          contactName = contact.name;
                        }
                        return app.models.Mail_Address.findOrCreate(
                          {
                            where: {
                              email: contact.address
                            }
                          },
                          {
                            email: contact.address,
                            name: contactName
                          }
                        )
                          .then(function(mailAddress) {
                            if (
                              mailAddress.created &&
                              mailAddress.instance.name &&
                              !contactName
                            ) {
                              return mailAddress.instance;
                            }
                            return mailAddress.instance.updateAttributes({
                              name: contactName
                            });
                          })
                          .then(function(address) {
                            let props = {
                              addressId: address.id,
                              emailId: mailItem.id,
                              date: mailItem.date,
                              type: type
                            };
                            return app.models.Mail_Item_Address.findOrCreate(
                              {
                                where: props
                              },
                              props
                            );
                          });
                      },
                      {
                        concurrency: 1
                      }
                    );
                  });
                }
              })
              .then(function() {
                let addresses = [];

                checkAddresses(emailParsed.to);
                checkAddresses(emailParsed.cc);

                function checkAddresses(data) {
                  if (!data) {
                    return;
                  }
                  data.value.forEach(function(entry) {
                    var address = entry.address;
                    if (address.split('@')[1] == domain) {
                      addresses.push(address);
                    }
                  });
                }

                return Promise.map(addresses, function(email) {
                  return Promise.resolve()
                    .then(function() {
                      var props = {
                        email: email
                      };
                      return app.models.Mail_Account.findOrCreate(
                        {
                          where: props
                        },
                        props
                      );
                    })
                    .then(function(mailAccount) {
                      var mailboxPath = 'inbox';
                      if (mailItem.spam || mailItem.infected) {
                        mailboxPath = 'junk';
                      }
                      var props = {
                        path: mailboxPath,
                        accountId: mailAccount.instance.id
                      };

                      return app.models.Mail_Box.findOrCreate(
                        {
                          where: props
                        },
                        props
                      );
                    })
                    .then(function(mailbox) {
                      return app.models.Mail_Item_Box.create({
                        mailboxId: mailbox.instance.id,
                        itemId: mailItem.id
                      });
                    });
                });
              })
              .then(function() {
                var KeyNew = urljoin('processed', storageKey);

                return app.storage.moveObject({
                  Bucket: config.buckets.email,
                  From: item.Key,
                  To: KeyNew
                });
              });
          },
          {
            concurrency: 4
          }
        );
      })
      .catch(function(err) {
        console.error(err);
      });
  }
};
