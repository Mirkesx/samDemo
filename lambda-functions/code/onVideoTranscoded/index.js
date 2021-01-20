// Lambda name: onVideoTranscoded
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
let s3Object = null;
let s3Bucket = null;

let config = {};
exports.handler = (event, context, callback) => {
    // GET CONFIG
    new AWS.Lambda().invoke({
        FunctionName: 'getConfig',
    }).promise().then((configResponse) => {
        config = JSON.parse(configResponse.Payload);
        run(event, context, callback);
    }).catch((err) => {
        console.log("Missing config", err);
    });

};

function run(event, context, callback) {
    console.log('onVideoTranscoded LAMBDA HAS BEEN TRIGGERED!');
    console.log('event', JSON.stringify(event));

    s3Object = event.Records[0].s3;
    s3Bucket = `s3://${s3Object.bucket.name}`;

    const srcKey = s3Object.object.key.replace(/\+/g, '%20');
    // GET S3 HEAD OBJECT
    const headObjectParams = {
        Bucket: s3Object.bucket.name,
        Key: srcKey
    };

    s3.headObject(headObjectParams).promise().then((headObject) => {
        try {
            console.log("headObjectJson: ", headObject);
            if (headObject) {
                let reachData = JSON.parse(headObject.Metadata.reachdata);
                if (reachData) {
                    const srcFilenameParts = srcKey.split('/');
                    console.log('srcFilenameParts', srcFilenameParts);

                    const srcFilename = srcFilenameParts[srcFilenameParts.length - 1];
                    const destFilename = reachData.destFilename;
                    const destFolder = `user-${reachData.userID}/assets/${reachData.reachType }/${reachData.destFilename}/`;
                    const destUrl = `${destFolder}${srcFilename}`;
                    const inputKey = reachData.inputKey;

                    let resultGetMetadata = {};
                    callLambdaToGetAssetMetadataFromDB(destFilename)
                        .then((data) => {
                            const payload = JSON.parse(data.Payload);
                            resultGetMetadata = payload[0].metadata;
                            reachData = resultGetMetadata;
                            const createFolderRequest = {
                                Bucket: s3Object.bucket.name,
                                Key: destFolder,
                                ContentType: 'application/x-directory',
                                Metadata: {
                                    reachdata: JSON.stringify(reachData)
                                }
                            };

                            s3.putObject(createFolderRequest).promise().then(() => {
                                // Move the objects
                                if (reachData.transcode) {
                                    moveInputs(inputKey, destFolder, reachData);
                                }
                                else {
                                    // Delete the outputs object
                                    const deleteInputsObjectsRequest = {
                                        Bucket: s3Object.bucket.name,
                                        Delete: {
                                            Objects: [{
                                                Key: inputKey,
                                            }]
                                        }
                                    };
                                    console.log(`Deleting video inputs video": ${JSON.stringify(deleteInputsObjectsRequest)}`);
                                    s3.deleteObjects(deleteInputsObjectsRequest)
                                        .promise()
                                        .then((delResult) => {
                                            console.log("Delete result: ", delResult);
                                        }).catch((delErr) => {
                                            console.log("Delete error: ", delErr);
                                        });
                                }
                                moveOutputs(srcKey, destUrl, reachData).then(() => {
                                    if (!reachData.transcode && reachData.contentType !== "model/gltf+json") {
                                        callLambdaSendNotification(reachData, "finished");
                                    }
                                });
                            });
                        })
                        .catch((error) => {
                            console.log("error", error);
                        });
                }
            }
            else {
                return;
            }
        }
        catch (err) {
            return;
        }
    }).catch((err) => {
        console.log("error: ", err);
        return;
    });
}

function moveInputs(srcKey, destFolder, reachData) {
    const lambda = new AWS.Lambda();
    // MOVE VIDEO FROM INPUTS TO USER FOLDER
    const copyInputsParams = {
        "s3BucketName": s3Object.bucket.name,
        "srcKey": srcKey,
        "destUrl": `${destFolder}master`,
        "reachData": reachData
    };
    console.log('Moving video from inputs... ', JSON.stringify(copyInputsParams));
    lambda.invoke({
        FunctionName: 'moveVideo',
        Payload: JSON.stringify(copyInputsParams, null, 3) // pass params
    }, (error, data) => {
        if (error) {
            console.log("error: ", error);
        }
        else if (data.Payload) {
            console.log("data: ", data);
        }
    });
}

function moveOutputs(srcKey, destUrl, reachData) {
    return new Promise((resolve, reject) => {
        const lambda = new AWS.Lambda();
        // COPY VIDEO FROM OUTPUTS TO USER FOLDER
        const copyOutputsParams = {
            "s3BucketName": s3Object.bucket.name,
            "srcKey": srcKey,
            "destUrl": destUrl,
            "reachData": reachData
        };
        console.log('Moving video from outputs... ', JSON.stringify(copyOutputsParams));
        lambda.invoke({
            FunctionName: 'moveVideo',
            Payload: JSON.stringify(copyOutputsParams, null, 3) // pass params
        }).promise().then((data) => {
            console.log("DATA moveVideo", data);
            if (data.Payload) {
                if (reachData.contentType === "model/gltf+json") {
                    unzip(destUrl, reachData, ['gltf']);
                }
                else if (reachData.contentType === "video/depthkit") {
                    unzip(destUrl, reachData, ['mp4','txt','json']);
                }
                resolve(data);
            }
            reject(data);
        }).catch((error) => {
            console.log("ERROR moveVideo", error);
            reject(error);
        });

    });
}

function unzip(zipFileKey, reachData, childrenToStoreByExtension = ['*']) {
    const lambda = new AWS.Lambda();
    // UNZIP COPIED ZIP FILE
    const unzipParams = {
        "s3BucketName": s3Object.bucket.name,
        "zipFileKey": zipFileKey,
        "deleteSource": true,
    };

    console.log('Unzipping file in user folder... ', JSON.stringify(unzipParams));
    lambda.invoke({
        FunctionName: 'unzip',
        Payload: JSON.stringify(unzipParams, null, 3) // pass params
    }).promise().then((data) => {
        console.log("DATA unzip", data);
        const payload = JSON.parse(data.Payload);
        let url = "";
        if (payload.length > 0) {
            let promiseArray = [];
            const breakOnFirst = childrenToStoreByExtension.length === 1 && childrenToStoreByExtension[0] != '*';

            for (let i = 0; i < payload.length; i++) {
                url = payload[i];
                const childExtension = url.split('.').pop();
                const storeChild = childrenToStoreByExtension.includes(childExtension) || childrenToStoreByExtension[0] === '*';
                if (storeChild) {
                    url = `${reachData.destFolder}${url}`;
                    const p = addChildToDB(url, reachData, s3Object.bucket.name);
                    promiseArray.push(p);
                    if (breakOnFirst) {
                        break;
                    }
                }
            }
            if (promiseArray.length > 0) {
                Promise.all(promiseArray).then(() => {
                    callLambdaSendNotification(reachData, "finished");
                }).catch((err) => {
                    console.log("OnVideoTranscoded => addChildToDB error", err);
                });
            }
        }
    }).catch((error) => {
        console.log("ERROR unzip", error);

    });
}

function callLambdaToGetAssetMetadataFromDB(uuid) {
    return new Promise((resolve, reject) => {
        const lambda = new AWS.Lambda();
        const payload = {
            "DB_name": "assets",
            "query_type": "GET_METADATA_FROM_ASSETS",
            "object": {
                "uuid": uuid
            }
        };
        lambda.invoke({
            FunctionName: 'DBQuery',
            Payload: JSON.stringify(payload) // pass params
        }).promise().then((data) => {
            console.log("DATA GET_METADATA_FROM_ASSETS", data);
            resolve(data);
        }).catch((error) => {
            console.log("ERROR GET_METADATA_FROM_ASSETS", error);
            reject(error);
        });
    });
}

function callLambdaSendNotification(reachData, asset_status) {
    const lambda = new AWS.Lambda();
    const payload = {
        "assetUUID": reachData.destFilename,
        "assetStatus": asset_status
    };
    console.log("reachData", reachData);
    console.log("payload", payload);
    lambda.invoke({
        FunctionName: 'sendNotification',
        Payload: JSON.stringify(payload) // pass params
    }, (error, data) => {
        if (error) {
            console.log("error: ", error);
        }
        else {
            console.log("data: ", data);
        }
    });
}

function addChildToDB(key, reachData, bucket) {
    return new Promise((resolve, reject) => {
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
                resolve(data);
            }).catch((err) => {
                console.log("error addChildrenToAssets: ", err);
                reject(err);
            });
    });
}
