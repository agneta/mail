module.exports = function(app) {
  if (!app.httpServer) {
    return;
  }

  return require('./imap')(app).then(function(server) {
    app.imap = {
      server: server
    };
  });
};
