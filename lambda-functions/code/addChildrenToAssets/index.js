const AWS = require('aws-sdk');
const s3 = new AWS.S3();

exports.handler = async(event) => {
    console.log("EVENT IS: ", event);
    const bucket = event.bucket;
    const reachData = JSON.parse(event.reachData);
    const key = event.key;
    const response = addChildOnDB(key, reachData, bucket);

    return response;
};


async function addChildOnDB(key, reachData, bucket) {
    console.log("addChildOnDB key ", key);
    const splittedKey = key.split("/");
    const lastElement = splittedKey[splittedKey.length - 1];
    const splitExtension = lastElement.split(".");
    let conditionVideo = false;
    if (reachData.contentType === 'video/depthkit') {
        conditionVideo = splitExtension.length > 1;
    }
    else if ((reachData.contentType.indexOf("video/") > -1)) {
        conditionVideo = (reachData.contentType.indexOf("video/") > -1) && (splitExtension[splitExtension.length - 1] !== "ts");
    }

    const conditionImage = (reachData.contentType.indexOf("image/") > -1);
    const conditionAudio = (reachData.contentType.indexOf("audio/") > -1);
    const conditionModel = (reachData.contentType.indexOf("model/gltf+json") > -1) && (splitExtension[splitExtension.length - 1] === "gltf");


    if (conditionVideo || conditionImage || conditionAudio || conditionModel) {
        const url = `https://s3-${process.env.AWS_REGION}.amazonaws.com/${bucket}/${key}`;
        const lambda = new AWS.Lambda();
        const payload = {
            "DB_name": "assets",
            "query_type": "INSERT_ASSET_CHILD",
            "object": {
                "url": url,
                "uuid": reachData.destFilename
            }
        };
        try {
            const response = await lambda.invoke({
                FunctionName: 'DBQuery',
                Payload: JSON.stringify(payload) // pass params
            }).promise();
            if (response) {
                return response;
            }
        }
        catch (error) {
            return error;
        }

    }
}
