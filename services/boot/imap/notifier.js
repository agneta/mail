'use strict';

const EventEmitter = require('events').EventEmitter;
const log = require('npmlog');
const counters = require('@agneta/imap/lib/counters');
const consts = require('@agneta/imap/lib/consts');
const Promise = require('bluebird');
const _ = require('lodash');

class ImapNotifier extends EventEmitter {
  constructor(options) {
    super();

    this.models = options.app.models;
    this.publisher = options.redis.publisher;
    this.counters = counters(this.publisher);

    this.logger = options.logger || {
      info: log.silly.bind(log, 'IMAP'),
      debug: log.silly.bind(log, 'IMAP'),
      error: log.error.bind(log, 'IMAP')
    };

    if (options.pushOnly) {
      // do not need to set up the following if we do not care about updates
      return;
    }

    this.connectionSessions = new WeakMap();

    // Subscriber needs its own client connection. This is relevant only in the context of IMAP
    this.subsriber = options.redis.createClient();

    this._listeners = new EventEmitter();
    this._listeners.setMaxListeners(0);

    let publishTimers = new Map();
    let scheduleDataEvent = ev => {
      let data;

      let fire = () => {
        clearTimeout(data.timeout);
        publishTimers.delete(ev);
        this._listeners.emit(ev);
      };

      if (publishTimers.has(ev)) {
        data = publishTimers.get(ev) || {};
        clearTimeout(data.timeout);
        data.count++;

        if (data.initial < Date.now() - 1000) {
          // if the event has been held back already for a second, then fire immediatelly
          return fire();
        }
      } else {
        // initialize new event object
        data = {
          ev,
          count: 1,
          initial: Date.now(),
          timeout: null
        };
      }

      data.timeout = setTimeout(() => {
        fire();
      }, 100);
      data.timeout.unref();

      if (!publishTimers.has(ev)) {
        publishTimers.set(ev, data);
      }
    };

    this.subsriber.on('message', (channel, message) => {
      if (channel === 'wd_events') {
        let data;
        try {
          data = JSON.parse(message);
        } catch (E) {
          return;
        }
        if (data.e && !data.p) {
          // events without payload are scheduled, these are notifications about changes in journal
          scheduleDataEvent(data.e);
        } else if (data.e) {
          // events with payload are triggered immediatelly, these are actions for doing something
          this._listeners.emit(data.e, data.p);
        }
      }
    });

    this.subsriber.subscribe('wd_events');
  }

  /**
   * Registers an event handler for userid events
   *
   * @param {Object} session
   * @param {Function} handler Function to run once there are new entries in the journal
   */
  addListener(session, handler) {
    this._listeners.addListener(session.user.id.toString(), handler);

    this.logger.debug(
      '[%s] New journal listener for %s (%s)',
      session.id,
      session.user.id.toString(),
      session.user.username
    );
  }

  /**
   * Unregisters an event handler for path:user events
   *
   * @param {Object} session
   * @param {Function} handler Function to run once there are new entries in the journal
   */
  removeListener(session, handler) {
    this._listeners.removeListener(session.user.id.toString(), handler);

    this.logger.debug(
      '[%s] Removed journal listener from %s (%s)',
      session.id,
      session.user.id.toString(),
      session.user.username
    );
  }

  /**
   * Stores multiple journal entries to db
   *
   * @param {String} mailbox Mailbox ID
   * @param {Array|Object} entries An array of entries to be journaled
   * @param {Function} callback Runs once the entry is either stored or an error occurred
   */
  addEntries(mailbox, entries, callback) {
    if (entries && !Array.isArray(entries)) {
      entries = [entries];
    } else if (!entries || !entries.length) {
      return false;
    }
    let self = this;

    // find list of message ids that need to be updated
    let updated = entries
      .filter(entry => !entry.modseq && entry.message)
      .map(entry => entry.message);

    function getMailbox() {
      return Promise.resolve().then(function() {
        if (!mailbox) {
          return false;
        }

        let mailboxData;
        let mailboxQuery;
        let mailboxId = mailbox._id || mailbox.id;
        if (mailboxId) {
          // we were already provided a mailbox object
          mailboxQuery = {
            id: mailboxId
          };
          mailboxData = mailbox;
        } else {
          mailboxQuery = {
            id: mailbox
          };
        }

        if (updated.length) {
          // provision new modseq value
          return self.models.Mail_Box.findOne(mailboxQuery).then(function(
            mailbox
          ) {
            mailbox.modifyIndex++;
            return mailbox.save();
          });
        }
        if (mailboxData) {
          return mailboxData;
        }
        return self.models.Mail_Box.findOne(mailboxQuery);
      });
    }

    // final action to push entries to journal
    function pushToJournal() {
      return Promise.map(entries, function(entry) {
        return self.models.Mail_Journal.create(entry);
      }).then(function() {
        self.updateCounters(entries);
        return entries.length;
      });
    }

    return getMailbox()
      .then(function(mailboxData) {
        if (!mailboxData) {
          let err = new Error('Selected mailbox does not exist');
          err.code = 'NoSuchMailbox';
          return Promise.reject(err);
        }

        let modseq = mailboxData.modifyIndex;
        let created = new Date();

        entries.forEach(entry => {
          entry.modseq = entry.modseq || modseq;
          entry.created = entry.created || created;
          entry.mailbox = entry.mailbox || mailboxData.id;
          entry.user = mailboxData.user;
        });

        if (updated.length) {
          self.logger.debug(
            'Updating message collection %s %s entries',
            mailboxData.id,
            updated.length
          );

          return Promise.map(updated, function(messageId) {
            return self.models.Mail_Item.count({
              id: messageId,
              modseq: {
                lt: modseq
              }
            }).then(function(count) {
              if (!count) {
                return;
              }
              return self.models.Mail_Item.upsert({
                id: messageId,
                modseq: modseq
              });
            });
          });
        } else {
          return pushToJournal();
        }
      })
      .asCallback(callback);
  }

  /**
   * Sends a notification that there are new updates in the selected mailbox
   *
   * @param {String} user User ID
   */
  fire(options, payload) {
    var self = this;
    if (!options) {
      return;
    }
    return Promise.resolve()
      .then(function() {
        if (_.isString(options)) {
          return [options];
        }
        if (options.mailAccount) {
          return self.models.Mail_Account_User.find({
            fields: {
              userid: true
            },
            where: {
              accountId: options.mailAccount
            }
          }).then(function(result) {
            return _.map(result, 'userId');
          });
        }
        throw new Error('Options are not correct');
      })
      .then(function(users) {
        return Promise.map(users, function(user) {
          let data = JSON.stringify({
            e: user.toString(),
            p: payload
          });
          console.log(data);
          return self.publisher.publish('wd_events', data);
        });
      });
  }

  /**
   * Returns all entries from the journal that have higher than provided modification index
   *
   * @param {String} mailbox Mailbox ID
   * @param {Number} modifyIndex Last known modification id
   * @param {Function} callback Returns update entries as an array
   */
  getUpdates(mailbox, modifyIndex, callback) {
    modifyIndex = Number(modifyIndex) || 0;
    return this.models.Mail_Journal.find({
      mailbox: mailbox._id || mailbox,
      modseq: {
        $gt: modifyIndex
      }
    }).asCallback(callback);
  }

  updateCounters(entries) {
    if (!entries) {
      return;
    }
    let counters = new Map();
    (Array.isArray(entries) ? entries : [].concat(entries || [])).forEach(
      entry => {
        let m = entry.mailbox.toString();
        if (!counters.has(m)) {
          counters.set(m, { total: 0, unseen: 0, unseenChange: false });
        }
        switch (entry && entry.command) {
          case 'EXISTS':
            counters.get(m).total += 1;
            if (entry.unseen) {
              counters.get(m).unseen += 1;
            }
            break;
          case 'EXPUNGE':
            counters.get(m).total -= 1;
            if (entry.unseen) {
              counters.get(m).unseen -= 1;
            }
            break;
          case 'FETCH':
            if (entry.unseen) {
              // either increase or decrese
              counters.get(m).unseen +=
                typeof entry.unseen === 'number' ? entry.unseen : 1;
            } else if (entry.unseenChange) {
              // volatile change, just clear the cache
              counters.get(m).unseenChange = true;
            }
            break;
        }
      }
    );

    let pos = 0;
    let rows = Array.from(counters);
    let updateCounter = () => {
      if (pos >= rows.length) {
        return;
      }
      let row = rows[pos++];
      if (!row || !row.length) {
        return updateCounter();
      }
      let mailbox = row[0];
      let delta = row[1];

      this.counters.cachedcounter(
        'total:' + mailbox,
        delta.total,
        consts.MAILBOX_COUNTER_TTL,
        () => {
          if (delta.unseenChange) {
            // Message info changed in mailbox, so just te be sure, clear the unseen counter as well
            // Unseen counter is more volatile and also easier to count (usually only a small number on indexed messages)
            this.publisher.del('unseen:' + mailbox, updateCounter);
          } else if (delta.unseen) {
            this.counters.cachedcounter(
              'unseen:' + mailbox,
              delta.unseen,
              consts.MAILBOX_COUNTER_TTL,
              updateCounter
            );
          } else {
            setImmediate(updateCounter);
          }
        }
      );
    };

    updateCounter();
  }

  allocateConnection(data, callback) {
    if (!data || !data.session || this.connectionSessions.has(data.session)) {
      return callback(null, true);
    }

    let rlkey = 'lim:' + data.service;
    this.counters.limitedcounter(
      rlkey,
      data.user,
      1,
      data.limit || 15,
      (err, res) => {
        if (err) {
          return callback(err);
        }

        if (!res.success) {
          return callback(null, false);
        }

        this.connectionSessions.set(data.session, {
          service: data.service,
          user: data.user
        });

        return callback(null, true);
      }
    );
  }

  releaseConnection(data, callback) {
    // unauthenticated sessions are unknown
    if (!data || !data.session || !this.connectionSessions.has(data.session)) {
      return callback(null, true);
    }

    let entry = this.connectionSessions.get(data.session);
    this.connectionSessions.delete(data.session);

    let rlkey = 'lim:' + entry.service;
    this.counters.limitedcounter(rlkey, entry.user, -1, 0, err => {
      if (err) {
        this.logger.debug(
          '[%s] Failed to release connection for user %s. %s',
          data.session.id,
          entry.user,
          err.message
        );
      }
      return callback(null, true);
    });
  }
}

module.exports = ImapNotifier;
