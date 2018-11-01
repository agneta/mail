const INTERVAL = 1000 * 6;
const Promise = require('bluebird');
const jobName = 'emailReceive';

module.exports = function(app) {
  var config = app.get('storage');
  var domain = app.web.project.config.domain.production;
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
          Bucket: config.buckets.email,
          Prefix: 'incoming/'
        });
      })
      .then(function(result) {
        //console.log(result);
        let progress = 0;

        return Promise.map(
          result.Contents,
          function(item) {
            return app.models.Mail_Item.add(item).then(function() {
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
