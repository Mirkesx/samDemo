// Lambda name: moveVideo

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = (event, context, callback) => {
    console.log('moveVideo LAMBDA HAS BEEN TRIGGERED!');
    console.log('event: ' + JSON.stringify(event));

    const s3Bucket = `s3://${event.s3BucketName}`;
    const srcKey = event.srcKey;
    const destUrl = event.destUrl;
    const srcUrl = `${s3Bucket}/${srcKey}`;
    const reachData = event.reachData;

    const copyObjectRequest = {
        Bucket: event.s3BucketName,
        CopySource: `${event.s3BucketName}/${srcKey}`,
        Key: destUrl,
        ACL: 'public-read',
        Metadata: { reachdata: JSON.stringify(reachData) },
        MetadataDirective: 'REPLACE'
    };
    // EXAMPLE
    // {
    // "Bucket": "mybucket",
    // "CopySource": "mybucket/outputs/myvideo---64k-00001.aac",
    // "Key": "user-0001/assets/sky/myvideoNewName---64k-00001.aac"
    //}


    console.log(`Copiyng video: ${JSON.stringify(copyObjectRequest)}`);

    // Copy the object to a new location
    s3.copyObject(copyObjectRequest)
        .promise()
        .then((copyRes) => {
            console.log(`Video copied successfully...`);
            addChildOnDB(destUrl, reachData, event.s3BucketName);
            // Delete the outputs object
            const deleteOutputsObjectsRequest = {
                Bucket: event.s3BucketName,
                Delete: {
                    Objects: [{
                            Key: srcKey,
                        }
                    ]
                }
            };

            console.log(`Deleting video src video": ${JSON.stringify(deleteOutputsObjectsRequest)}`);
            s3.deleteObjects(deleteOutputsObjectsRequest)
                .promise()
                .then((delResult) => {
                    console.log("Delete result: ", delResult);
                }).catch((delErr) => {
                    console.log("Delete error: ", delErr);
                });

        })
        // Error handling is left up to reader
        .catch((e) => console.error(e))
};


function addChildOnDB(key, reachData, bucket) {
    const lambda = new AWS.Lambda();
    const payload = {
        "uuid": reachData.destFilename,
        "url": key,
        "reachData": JSON.stringify(reachData),
        "bucket": bucket,
        "key": key
    };
    lambda.invoke({
            FunctionName: 'addChildrenToAssets',
            Payload: JSON.stringify(payload) // pass params
        }).promise()
        .then((data) => {
            console.log("Data addChildrenToAssets: ", data);
        }).catch((err) => {
            console.log("error addChildrenToAssets: ", err);
        });
}