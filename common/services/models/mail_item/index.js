const Indexer = require('@agneta/imap/lib/indexer/indexer');

module.exports = function(Model, app) {
  Model.indexer = new Indexer();
  require('./prepare')(Model, app);
  require('./beforeSave')(Model, app);
};
