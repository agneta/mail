const Indexer = require('@agneta/imap/lib/indexer/indexer');

module.exports = function(Model, app) {
  Model.indexer = new Indexer();
  require('./beforeSave')(Model, app);
  require('./add')(Model, app);
};
