const urljoin = require('url-join');
const path = require('path');
const simpleParser = require('mailparser').simpleParser;
const _ = require('lodash');
const stream = require('stream');
const Promise = require('bluebird');

module.exports = function(Model, app) {
  var config = app.get('storage');
  var domain = app.web.project.config.domain.production;

  Model.add = function(options) {
    let item = options.s3Object;
    let KeyParsed = path.parse(item.Key);
    let storageKey = KeyParsed.name;
    let mailItem = null;
    let emailParsed = null;
    let emailProps = null;
    let headObject;
    let mailbox;
    let bucket = config.buckets.email.host;

    return Promise.resolve()
      .then(function() {
        return app.storage.headObject({
          Bucket: bucket,
          Key: item.Key
        });
      })
      .then(function(_headObject) {
        headObject = _headObject;

        if (headObject.ContentType == 'application/x-directory') {
          return Promise.reject({
            skip: true,
            message: 'it is a directory'
          });
        }

        var objectStream = app.storage.getObjectStream({
          Bucket: bucket,
          Key: item.Key
        });
        return simpleParser(objectStream);
      })
      .then(function(_emailParsed) {
        emailParsed = _emailParsed;
        //console.log(emailParsed);

        emailParsed.headers = [...emailParsed.headers.entries()].reduce(
          (obj, [key, value]) => ((obj[key] = value), obj),
          {}
        );

        emailProps = {
          spam: emailParsed.headers['x-ses-spam-verdict'] != 'PASS',
          infected: emailParsed.headers['x-ses-virus-verdict'] != 'PASS'
        };

        var receivedEntry = emailParsed.headers.received;
        if (!receivedEntry) {
          console.error(emailParsed.headers);

          return Promise.reject({
            skip: true,
            message: 'No received header'
          });
        }
        if (_.isArray(receivedEntry)) {
          receivedEntry = receivedEntry[0];
        }

        var match = receivedEntry.match(/(?<= for )(.*?)(?=; )/g);

        if (!match) {
          console.error(emailParsed.headers);

          return Promise.reject({
            skip: true,
            message: 'No email match for receive header: ' + receivedEntry
          });
        }

        var email = match[0];
        if (!email) {
          return Promise.reject({
            skip: true,
            message:
              'Could not find email from received header: ' + receivedEntry
          });
        }

        email = email.toLowerCase();
        email = _.trim(email);

        let emailParts = email.split('@');
        let emailName = emailParts[0];
        let emailHost = emailParts[1];

        if (emailHost != domain) {
          return Promise.reject(
            new Error(
              `Email host receipient did not match the domain: ${domain}`
            )
          );
        }

        var props = {
          email: email
        };
        return app.models.Mail_Account.upsertWithWhere(
          props,
          _.extend(
            {
              name: emailName
            },
            props
          )
        );
      })
      .then(function(mailAccount) {
        var mailboxPath = 'INBOX';
        if (emailProps.spam || emailProps.infected) {
          mailboxPath = 'JUNK';
        }
        var props = {
          path: `${mailboxPath}/${mailAccount.name}`,
          mailAccountId: mailAccount.id
        };

        return app.models.Mail_Box.findOrCreate(
          {
            where: props
          },
          props
        );
      })
      .then(function(result) {
        mailbox = result.instance;
        mailbox.uidNext++;
        //console.log(mailbox);

        let from = emailParsed.from || {};
        let to = emailParsed.to || {};
        let cc = emailParsed.cc || {};
        let bcc = emailParsed.bcc || {};
        let replyTo = emailParsed['reply-to'] || {};

        _.extend(emailProps, {
          from: from.value,
          to: to.value,
          cc: cc.value,
          bcc: bcc.value,
          replyTo: replyTo.value,
          references: emailParsed.references,
          storageKey: storageKey,
          headers: emailParsed.headers,
          subject: emailParsed.subject,
          messageId: emailParsed.messageId,
          date: emailParsed.date,
          html: emailParsed.html || emailParsed.textAsHtml,
          text: emailParsed.text,
          flags: [],
          size: headObject.ContentLength,
          attachments: _.map(emailParsed.attachments, function(attachment) {
            return _.pick(attachment, ['filename', 'contentType', 'size']);
          }),
          mailboxId: mailbox.id,
          mailAccountId: mailbox.mailAccountId,
          uid: mailbox.uidNext,
          modseq: mailbox.modifyIndex + 1
        });

        //console.log(emailProps);

        return app.models.Mail_Item.upsertWithWhere(
          {
            storageKey: storageKey
          },
          emailProps
        );
      })
      .then(function(_mailItem) {
        mailItem = _mailItem;

        if (mailItem.infected) {
          return;
        }

        return Promise.map(emailParsed.attachments, function(attachment) {
          let location = urljoin(
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
                return app.models.Mail_Address.upsertWithWhere(
                  {
                    email: contact.address
                  },
                  {
                    email: contact.address,
                    name: contactName
                  }
                ).then(function(address) {
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
        return mailbox.save();
      })
      .then(function() {
        var KeyNew = urljoin('processed', storageKey);

        return app.storage.moveObject({
          Bucket: bucket,
          From: item.Key,
          To: KeyNew
        });
      })
      .then(function() {
        return app.imap.server.notifier
          .addEntries(mailbox, {
            command: 'EXISTS',
            uid: mailItem.uid,
            ignore: options.session && options.session.id,
            message: mailItem.id,
            modseq: mailItem.modseq,
            unseen: mailItem.unseen
          })
          .then(function() {
            return app.imap.server.notifier.fire({
              mailAccount: mailbox.mailAccountId
            });
          });
      })
      .catch(function(err) {
        if (err.skip) {
          var KeyNew = urljoin('skipped', storageKey);

          return app.storage.moveObject({
            Bucket: bucket,
            From: item.Key,
            To: KeyNew
          });
        }
        return Promise.reject(err);
      });
  };
};
