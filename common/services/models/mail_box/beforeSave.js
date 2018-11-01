const _ = require('lodash');
module.exports = function(Model) {
  Model.observe('before save', function(ctx) {
    var instance = ctx.data || ctx.currentInstance || ctx.instance;

    return Promise.resolve().then(function() {
      let flags = instance.flags || [];
      flags = _.uniq(flags);

      instance.flags = flags;
    });
  });
};
