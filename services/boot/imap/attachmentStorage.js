const Promise = require('bluebird');

module.exports = function(app) {
  return {
    get,
    createReadStream,
    create
  };
  function get(attachmentId, callback) {
    return Promise.resolve()
      .then(function() {})
      .asCallbacl(callback);
  }

  function createReadStream(attachmentId, attachmentData) {}

  function create() {
    console.log(arguments);
  }
};
