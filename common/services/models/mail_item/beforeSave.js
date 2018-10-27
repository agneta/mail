const _ = require('lodash');
module.exports = function(Model) {
  Model.observe('before save', function(ctx) {
    var instance = ctx.data || ctx.currentInstance || ctx.instance;

    return Promise.resolve()
      .then(function() {
        if (!_.isInteger(instance.modseq)) {
          return;
        }
        instance.modseq += 1;
      })
      .then(function() {
        let flags = instance.flags;
        if (!flags) {
          return;
        }
        instance.unseen = !flags.includes('\\Seen');
        instance.flagged = flags.includes('\\Flagged');
        instance.undeleted = !flags.includes('\\Deleted');
        instance.draft = flags.includes('\\Draft');
      });
  });
};
