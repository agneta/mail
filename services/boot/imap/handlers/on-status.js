module.exports = function() {
  return function(path, session, callback) {
    console.log(path);
    callback();
  };
};
