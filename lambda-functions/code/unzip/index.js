'use strict';

let AWS = require('aws-sdk');
let s3 = new AWS.S3({
  apiVersion: '2006-03-01'
});
let Rx = require('rx');
let AdmZip = require('adm-zip');
exports.handler = (event, context, callback) => {
  console.log(event);

  const bucketName = event.s3BucketName;
  const file_key = event.zipFileKey;
  const folderUrl = event.destinationFolder || getFolder(file_key);
  const deleteSource = event.deleteSource;

  console.log("bucketName: ", bucketName);
  console.log("file_key: ", file_key);
  console.log("folderUrl: ", folderUrl);
  console.log("deleteSource: ", deleteSource);

  let params = {
    Bucket: bucketName,
    Key: file_key
  };
  let urls = [];
  let count = 0;
  s3.getObject(params, (err, data) => {
    if (err) {
      callback(err, null);
    } else {
      if (!data) callback(null, 'No Data!');
      let zip = new AdmZip(data.Body);
      let zipEntries = zip.getEntries(); // ZipEntry objects
      let source = Rx.Observable.from(zipEntries);
      let results = [];
      source.subscribe(
        (zipEntry) => {
          const entryName = zipEntry.entryName;
          console.log("entryName: ", JSON.stringify(entryName));
          if (entryName.indexOf(".DS_Store") === -1 && entryName.indexOf("__MACOSX") === -1) {
            let params = {
              Bucket: bucketName,
              Key: folderUrl + entryName,
              ACL: 'public-read',
              Body: zipEntry.getData() // decompressed file as buffer
            };
            urls.push(entryName);

            // upload decompressed file
            
            s3.putObject(params, (err, data) => {
              if (err) console.log(err, err.stack); // an error occurred
            });
          }
        },
        (err) => {
          callback(err, null);
        },
        () => {
          if (deleteSource) {
            let params = {
              Bucket: bucketName,
              Key: file_key
            };
            
            // Delete zip file
            s3.deleteObject(params, (err, data) => {
              if (err) {
                callback(err, null);
              } else {
                callback(null, urls);
              }
            });
          } else {
            callback(null, urls);
          }
        }
      );
    }
  });
};

function getFolder(awsKey) {
  const n = awsKey.lastIndexOf("/");
  const res = awsKey.slice(0, n + 1);
  return res;
}