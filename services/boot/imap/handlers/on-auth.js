module.exports = function() {
  return function(login, session, callback) {
    console.log(login, session);
    callback();
  };
};
