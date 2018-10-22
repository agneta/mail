module.exports = function() {
  return function(mailbox, update, session, callback) {
    console.log(mailbox, update, session);
    callback();
  };
};
