'use strict';

module.exports = function(options) {
  var app = options.app;
  var redis = options.redis.publisher;

  return {
    flush: function(user) {
      return redis.del('cached:' + user);
    },
    get: function(user, key, defaultValue) {
      return redis.hget('cached:' + user, key).then(function(value) {
        if (value) {
          return value;
        }

        return app.models.Account.findById(user, {
          fields: {
            id: true
          }
        }).then(function(userData) {
          if (!userData) {
            return defaultValue;
          }

          value = userData[key] || defaultValue;
          return redis.hset('cached:' + user, key, value);
        });
      });
    }
  };
};
