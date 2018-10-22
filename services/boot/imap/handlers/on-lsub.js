module.exports = function() {
  return function(query, session, callback) {
    console.log(query, session, session);
    callback();
  };
};
