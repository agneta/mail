module.exports = {
  imap: {
    enabled: true,
    port: 993,
    host: '0.0.0.0',
    secure: true,
    maxMB: 25,
    retention: 30,
    maxDownloadMB: 10000,
    maxUploadMB: 10000,
    maxConnections: 15,
    disableRetention: false,
    disableSTARTTLS: false,
    useProxy: false,
    ignoredHosts: [],
    setup: {
      autoExpunge: true,
      hostname: 'localhost'
    },
    tls: {}
  }
};
