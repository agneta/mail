module.exports = function() {
  return function(quotaRoot, session, callback) {
    console.log(quotaRoot, session, session);
    callback();
  };
};
