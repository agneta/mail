module.exports = function() {
  return function(path, newname, session, callback) {
    console.log(path, newname, session, session);
    callback();
  };
};
