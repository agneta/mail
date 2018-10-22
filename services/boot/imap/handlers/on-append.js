module.exports = function() {
  return function(path, flags, date, raw, session, callback) {
    console.log(path, flags, date, raw, session);
    callback();
  };
};
