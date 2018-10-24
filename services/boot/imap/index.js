'use strict';

const IMAPServerModule = require('@agneta/imap');
const IMAPServer = IMAPServerModule.IMAPServer;

const log = require('npmlog');
const config = require('./config');
const packageData = require('../../../package.json');

const ImapNotifier = require('@agneta/imap/lib/imap-notifier');
const Indexer = require('@agneta/imap/lib/indexer/indexer');
const Certs = require('./certs');

const onFetch = require('./handlers/on-fetch');
const onAuth = require('./handlers/on-auth');
const onList = require('./handlers/on-list');
const onLsub = require('./handlers/on-lsub');
const onSubscribe = require('./handlers/on-subscribe');
const onUnsubscribe = require('./handlers/on-unsubscribe');
const onCreate = require('./handlers/on-create');
const onRename = require('./handlers/on-rename');
const onDelete = require('./handlers/on-delete');
const onOpen = require('./handlers/on-open');
const onStatus = require('./handlers/on-status');
const onAppend = require('./handlers/on-append');
const onStore = require('./handlers/on-store');
const onExpunge = require('./handlers/on-expunge');
const onCopy = require('./handlers/on-copy');
const onMove = require('./handlers/on-move');
const onSearch = require('./handlers/on-search');
const onGetQuotaRoot = require('./handlers/on-get-quota-root');
const onGetQuota = require('./handlers/on-get-quota');

let logger = {
  info(...args) {
    args.shift();
    log.info('IMAP', ...args);
  },
  debug(...args) {
    args.shift();
    log.silly('IMAP', ...args);
  },
  error(...args) {
    args.shift();
    log.error('IMAP', ...args);
  }
};

let indexer;
let certs;
let notifier;

let createInterface = (ifaceOptions, callback) => {
  // Setup server
  const serverOptions = {
    secure: ifaceOptions.secure,
    secured: ifaceOptions.secured,

    disableSTARTTLS: ifaceOptions.disableSTARTTLS,
    ignoreSTARTTLS: ifaceOptions.ignoreSTARTTLS,

    useProxy: !!config.imap.useProxy,
    ignoredHosts: config.imap.ignoredHosts,

    id: {
      name: config.imap.name || 'WildDuck IMAP Server',
      version: config.imap.version || packageData.version,
      vendor: config.imap.vendor || 'Kreata'
    },

    logger,

    maxMessage: config.imap.maxMB * 1024 * 1024,
    maxStorage: config.maxStorage * 1024 * 1024
  };

  certs.loadTLSOptions(serverOptions, 'imap');

  const server = new IMAPServer(serverOptions);

  certs.registerReload(server, 'imap');

  let started = false;
  server.on('error', err => {
    if (!started) {
      started = true;
      return callback(err);
    }

    logger.error(
      {
        err
      },
      '%s',
      err.message
    );
  });

  server.indexer = indexer;
  server.notifier = notifier;

  // setup command handlers for the server instance
  var locals = {
    server: server
  };
  server.onFetch = onFetch(locals);
  server.onAuth = onAuth(locals);
  server.onList = onList(locals);
  server.onLsub = onLsub(locals);
  server.onSubscribe = onSubscribe(locals);
  server.onUnsubscribe = onUnsubscribe(locals);
  server.onCreate = onCreate(locals);
  server.onRename = onRename(locals);
  server.onDelete = onDelete(locals);
  server.onOpen = onOpen(locals);
  server.onStatus = onStatus(locals);
  server.onAppend = onAppend(locals);
  server.onStore = onStore(locals);
  server.onExpunge = onExpunge(locals);
  server.onCopy = onCopy(locals);
  server.onMove = onMove(locals);
  server.onSearch = onSearch(locals);
  server.onGetQuotaRoot = onGetQuotaRoot(locals);
  server.onGetQuota = onGetQuota(locals);

  // start listening
  server.listen(ifaceOptions.port, ifaceOptions.host, () => {
    if (started) {
      return server.close();
    }
    started = true;
    callback(null, server);
  });
};

module.exports = (app, done) => {
  if (!config.imap.enabled) {
    return setImmediate(() => done(null, false));
  }

  var options = {
    redis: app.redis
  };
  certs = Certs(app);
  indexer = new Indexer(options);
  notifier = new ImapNotifier(options);

  let ifaceOptions = [
    {
      enabled: true,
      secure: config.imap.secure,
      disableSTARTTLS: config.imap.disableSTARTTLS,
      ignoreSTARTTLS: config.imap.ignoreSTARTTLS,
      host: config.imap.host,
      port: config.imap.port
    }
  ]
    .concat(config.imap.interface || [])
    .filter(iface => iface.enabled);

  let iPos = 0;
  let startInterfaces = () => {
    if (iPos >= ifaceOptions.length) {
      return done();
    }
    let opts = ifaceOptions[iPos++];

    createInterface(opts, err => {
      if (err) {
        logger.error(
          {
            err,
            tnx: 'bind'
          },
          'Failed starting %sIMAP interface %s:%s. %s',
          opts.secure ? 'secure ' : '',
          opts.host,
          opts.port,
          err.message
        );
        return done(err);
      }
      setImmediate(startInterfaces);
    });
  };
  setImmediate(startInterfaces);
};
