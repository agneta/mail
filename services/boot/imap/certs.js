'use strict';

const config = require('./config');
const certs = new Map();
const servers = [];

module.exports = app => {
  certs.set('default', {
    key: app.httpServer.key,
    cert: app.httpServer.cert,
    ca: app.httpServer.ca
  });

  return {
    get: type =>
      (certs.has(type) ? certs.get(type) : certs.get('default')) || false,

    loadTLSOptions: (serverOptions, name) => {
      Object.keys(config[name].tls || {}).forEach(key => {
        if (!['key', 'cert', 'ca'].includes(key)) {
          serverOptions[key] = config[name].tls[key];
        }
      });

      let serverCerts = certs.get(name);

      if (serverCerts) {
        serverOptions.key = serverCerts.key;
        if (serverCerts.ca) {
          serverOptions.ca = serverCerts.ca;
        }
        serverOptions.cert = serverCerts.cert;
      }
    },

    registerReload: (server, name) => {
      servers.push({ server, name });
    }
  };
};
