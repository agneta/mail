module.exports = function() {
  return function(mailbox, options, session, callback) {
    console.log(mailbox, options, session);
    callback();
  };
};
