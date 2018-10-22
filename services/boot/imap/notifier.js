'use strict';

const EventEmitter = require('events').EventEmitter;

class ImapNotifier extends EventEmitter {
  constructor(options) {
    super();
    console.log(options);
  }

  addListener(session, handler) {
    console.log(session, handler);
  }

  removeListener(session, handler) {
    console.log(session, handler);
  }

  addEntries(mailbox, entries, callback) {
    console.log(mailbox, entries);
    callback();
  }

  fire(user, payload) {
    console.log(user, payload);
  }

  getUpdates(mailbox, modifyIndex, callback) {
    console.log(mailbox, modifyIndex);
    callback();
  }

  updateCounters(entries) {
    console.log(entries);
  }

  allocateConnection(data, callback) {
    console.log(data);
    callback();
  }

  releaseConnection(data, callback) {
    console.log(data);
    callback();
  }
}

module.exports = ImapNotifier;
