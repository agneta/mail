const uuidV1 = require('uuid/v1');
const parseDate = require('@agneta/imap/lib/parse-date');

module.exports = function(Model) {
  Model.prepare = function(options) {
    return Promise.resolve().then(function() {
      if (options.prepared) {
        return options.prepared;
      }

      let mimeTree =
        options.mimeTree || Model.indexer.parseMimeTree(options.raw);
      let size = Model.indexer.getSize(mimeTree);
      let bodystructure = Model.indexer.getBodyStructure(mimeTree);
      let envelope = Model.indexer.getEnvelope(mimeTree);
      let idate = (options.date && parseDate(options.date)) || new Date();
      let hdate =
        (mimeTree.parsedHeader.date &&
          parseDate(
            [].concat(mimeTree.parsedHeader.date || []).pop() || '',
            idate
          )) ||
        false;

      let flags = [].concat(options.flags || []);

      if (!hdate || hdate.toString() === 'Invalid Date') {
        hdate = idate;
      }

      let msgid = envelope[9] || '<' + uuidV1() + '@agneta.email>';

      let prepared = {
        size,
        bodystructure,
        envelope,
        idate,
        hdate,
        flags,
        msgid,
        unseen: !flags.includes('\\Seen'),
        flagged: flags.includes('\\Flagged'),
        undeleted: !flags.includes('\\Deleted'),
        draft: flags.includes('\\Draft')
      };

      return prepared;
    });
  };
};
