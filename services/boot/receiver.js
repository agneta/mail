const INTERVAL = 1000 * 6;
const Promise = require('bluebird');
const jobName = 'emailReceive';

module.exports = function(app) {
  var config = app.get('storage');
  if (!config) {
    return;
  }

  app.queue.add(jobName, null, {
    jobId: 1,
    repeat: {
      every: INTERVAL
    }
  });

  app.queue.process(jobName, rotateCheck);

  function rotateCheck() {
    return Promise.resolve()
      .then(function() {
        return app.storage.listObjects({
          Bucket: config.buckets.email.host,
          Prefix: 'incoming/'
        });
      })
      .then(function(result) {
        //console.log(result);
        let progress = 0;

        return Promise.map(
          result.Contents,
          function(s3Object) {
            return app.models.Mail_Item.add({
              s3Object: s3Object
            }).then(function() {
              progress++;
              console.log(
                `Processing emails: [${progress}/${result.Contents.length}]`
              );
            });
          },
          {
            concurrency: 1
          }
        );
      })
      .catch(function(err) {
        console.error(err);
      });
  }
};
