// Lambda name: transcodeVideo

const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const https = require('https');
let s3Object = null;
let s3Bucket = null;

let config = {};
exports.handler = (event, context, callback) => {
  console.log("INIT TRANSCODE");
  // GET CONFIG
  new AWS.Lambda().invoke({
    FunctionName: 'getConfig',
  }).promise().then((configResponse) => {
    console.log("CONFINg THEN");
    config = JSON.parse(configResponse.Payload);
    run(event, context, callback);
  }).catch((err) => { console.log("Missing config", err); });
};


function run(event, context, callback) {
  console.log('transcodeVideo LAMBDA HAS BEEN TRIGGERED!');

  s3Object = event.Records[0].s3;
  console.log("s3Object", s3Object);
  s3Bucket = `s3://${s3Object.bucket.name}`;
  console.log("s3Bucket", s3Bucket);
  let inputKey = s3Object.object.key;
  console.log("inputKey", inputKey);
  // const inputFilenameEncoded = inputKey.replace(INPUT_FOLDER_NAME, '');


  const headObjectParams = {
    Bucket: s3Object.bucket.name,
    Key: inputKey
  };
console.log("headObjectParams", headObjectParams);
  s3.headObject(headObjectParams).promise().then((headObject) => {
    try {
      console.log("headObjectJson: ", headObject);
      if (headObject) {
        // console.log("headObject.Metadata.reachdata", headObject.Metadata.reachdata);
        let reachData = JSON.parse(headObject.Metadata.reachdata);
        if (reachData) {
          reachData.inputsEtag = headObject.ETag;
          reachData.inputKey = inputKey;
          console.log("reachData", reachData);
          if (reachData.transcode) {
            callLambdaToGetSettingsFromDB(reachData.contentType)
              .then((data) => {
                const payload = data.Payload;
                console.log("callLambdaToGetSettingsFromDB DATA", payload);
                const firstElement = JSON.parse(payload)[0];
                console.log("callLambdaToGetSettingsFromDB payload", firstElement);
                const outputs = firstElement.settings.outputs;
                console.log("callLambdaToGetSettingsFromDB outputs", outputs);
                transcode(inputKey, reachData, outputs);
              })
              .catch((error) => {
                console.log("error", error);
                callback(error, null);
              });

          }
          else {
            fakeTranscode(inputKey, reachData);
          }
        }

      }
      else {
        return;
      }
    }
    catch (err) {
      console.log("ERRORRRR ", err)
      return;
    }

  }).catch((err) => {
    console.log("error: ", err);
    return;
  });
}

function transcode(inputKey, reachData, outputs) {
  console.log("Transcoding asset!");
  console.log("inputKey", inputKey);
  console.log("reachData", reachData);
  try {
    const inputUrl = `${s3Bucket}/${inputKey}`;
    // const outputUrl = `${s3Bucket}/user-${reachData.userID}/assets/${reachData.reachType}`;
    const outputUrl = `${s3Bucket}/${config.S3_OUTPUTS_FOLDER_NAME}${reachData.destFilename}`;
    // const outfilename = ""; //inputKey.replace(INPUT_FOLDER_NAME, '');
    // const contentType = reachData.contentType;
    // Headers for Zencoder request
    const zcHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Zencoder-Api-Key": config.ZC_API_KEY,
    };

    const outputHeaders = {
      "x-amz-meta-reachdata": JSON.stringify(reachData),
      // "x-amz-acl": "public-read"
    };
    fillOutputs(outputs, outputHeaders, outputUrl);
    // Zencoder API request data
    const zcApiData = {
      input: inputUrl,
      // notifications: config.ZC_NOTIFICATION_EMAIL,
      notifications: [{
        format: "json",
        url: config.REACH_BASE_URL_PROTO + config.REACH_BASE_URL + ":" + config.REACH_BASE_URL_PORT + config.REACH_NOTIFICATION_URL,

        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "reach-notification-key": config.REACH_NOTIFICATION_KEY,
          "asset-uuid": reachData.destFilename
        }
      }],
      outputs: outputs
    };

    // CREATING JSON OF DATA TO BE POST
    const jsonApiData = JSON.stringify(zcApiData);

    const options = {
      hostname: config.ZC_API_HOST_NAME,
      port: config.ZC_API_HOST_PORT,
      path: config.ZC_API_HOST_PATH,
      method: "POST",
      headers: zcHeaders
    };

    // LOG REQ DATA
    console.log("Request POST Options: ", options);
    console.log("Request POST data: ", jsonApiData);

    const req = https.request(options, function(res) {
      console.log('Response Status: ' + res.statusCode);
      console.log('Response Headers: ' + JSON.stringify(res.headers));
      res.setEncoding('utf8');

      res.on('data', function(body) {
        const errors = JSON.parse(body).errors;
        console.log("body.errors", errors);
        if (errors) {
          callLambdaDeleteAsset(reachData);
          callLambdaDeleteAssetChild(reachData);
          //deleteAsset(inputUrl, true);
          deleteAsset(reachData.destFolder.substring(0, reachData.destFolder.length - 1), false);
        }
        else {
          callLambdaToInsertOrUpdateAssetInDB(body, reachData, 'TRANSCODING');
          createFakeFiles(zcApiData.outputs, reachData);
        }

        // SUCCESS
        console.log('Response Body: ' + body);
      });

      res.on('error', function(err) {
        //callLambdaToInsertOrUpdateAssetInDB(err, reachData, 'TRANSCODE_FAILED');
        // RESPONSE ERROR
        console.log('Response Error: ' + err);
        callLambdaDeleteAsset(reachData);
        callLambdaDeleteAssetChild(reachData);
        deleteAsset(inputUrl, true);
        deleteAsset(reachData.destFolder.substring(0, reachData.destFolder.length - 1), false);
      });

    });

    req.on('error', function(e) {
      // ERROR
      console.log('problem with request: ' + e.message);
      callLambdaDeleteAsset(reachData);
      callLambdaDeleteAssetChild(reachData);
      deleteAsset(inputUrl, true);
      deleteAsset(reachData.destFolder.substring(0, reachData.destFolder.length - 1), false);
    });


    // write  data to request body
    req.write(jsonApiData);
    req.end();
  }
  catch (e) {
    console.warn('error: ', e);
  }
}

function fakeTranscode(inputKey, reachData) {
  console.log("FAKE transcoding asset!");
  console.log("inputKey", inputKey);
  console.log("reachData", reachData);
  const outputUrl = `${config.S3_OUTPUTS_FOLDER_NAME}${reachData.destFilename}/`;
  const inputUrl = `${s3Object.bucket.name}/${inputKey}`;
  const copyObjectRequest = {
    Bucket: s3Object.bucket.name,
    CopySource: inputUrl,
    Key: `${outputUrl}file`,
    Metadata: { reachdata: JSON.stringify(reachData) },
    MetadataDirective: 'REPLACE'
  };
  // EXAMPLE
  // {
  // "Bucket": "mybucket",
  // "CopySource": "mybucket/outputs/myvideo---64k-00001.aac",
  // "Key": "user-0001/assets/sky/myvideoNewName---64k-00001.aac"
  //}

  // efailla-bucket/outputs/5307e670-cc65-11e8-bb74-a383a1dbe255/64k-00001.aac
  console.log(`Copying video: ${JSON.stringify(copyObjectRequest)}`);

  // Copy the object to a new location
  s3.copyObject(copyObjectRequest)
    .promise()
    .then((copyRes) => {
      //callLambdaToInsertOrUpdateAssetInDB(copyObjectRequest, reachData, 'FINISHED');
      console.log(`Asset has been copied without transcoding: ${JSON.stringify(copyObjectRequest)}`);
    }).catch((err) => {
      //callLambdaToInsertOrUpdateAssetInDB(err, reachData, 'FAKE_TRANSCODE_REQUEST_ERROR');
      callLambdaDeleteAsset(reachData);
      callLambdaDeleteAssetChild(reachData);
      deleteAsset(inputUrl, true);
      deleteAsset(reachData.destFolder.substring(0, reachData.destFolder.length - 1), false);
      console.log("Copy folder error: ", err);
    });

  // }).catch((err) => {
  //   console.log("Create folder error: ", err);
  // })
}


function callLambdaToInsertOrUpdateAssetInDB(body, reachData, assetStatus) {
  const lambda = new AWS.Lambda();
  const payload = {
    "DB_name": "assets",
    "query_type": "INSERT_OR_UPDATE_ASSET",
    "object": {
      "user_id": reachData.userID,
      //"metadata": reachData,
      "uuid": reachData.destFilename,
      "transcoding_response": body,
      "asset_status": assetStatus
    }
  };
  lambda.invoke({
    FunctionName: 'DBQuery',
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

function callLambdaToGetSettingsFromDB(contentType) {
  return new Promise((resolve, reject) => {
    const lambda = new AWS.Lambda();
    const mime = contentType.split("/")[0];
    const payload = {
      "DB_name": "transcoding_settings",
      "query_type": "GET_SETTINGS",
      "object": {
        "mime": mime
      }
    };
    lambda.invoke({
      FunctionName: 'DBQuery',
      Payload: JSON.stringify(payload) // pass params
    }).promise().then((data) => {
      console.log("DATA GET_SETTINGS", data);
      resolve(data);
    }).catch((error) => {
      console.log("ERROR GET_SETTINGS", error);
      reject(error);
    });
  });
}

function callLambdaDeleteAsset(reachData) {
  return new Promise((resolve, reject) => {
    const lambda = new AWS.Lambda();
    const uuid = reachData.destFilename;
    const payload = {
      "DB_name": "assets",
      "query_type": "DELETE_ASSET",
      "object": {
        "uuid": uuid
      }
    };
    lambda.invoke({
      FunctionName: 'DBQuery',
      Payload: JSON.stringify(payload) // pass params
    }).promise().then((data) => {
      console.log("DATA DELETE_ASSET", data);
      resolve(data);
    }).catch((error) => {
      console.log("ERROR DELETE_ASSET", error);
      reject(error);
    });
  });
}

function deleteAsset(inputUrl, splitElement) {
  let prefix = inputUrl;
  if (splitElement) {
    const elements = inputUrl.split("/");
    prefix = `${elements[3]}/${elements[4]}/`;
  }

  let params = {
    Bucket: s3Object.bucket.name,
    Prefix: prefix
  };
  console.log("params", params);
  s3.listObjects(params).promise()
    .then((data) => {
      console.log("DATA GET_SETTINGS", data);
      let objectsToDelete = [];
      data.Contents.forEach(function(content) {
        objectsToDelete.push({ Key: content.Key });
      });

      let deleteParams = {
        Bucket: s3Object.bucket.name,
        Delete: {
          Objects: objectsToDelete
        }
      };

      s3.deleteObjects(deleteParams).promise()
        .then((res) => {
          console.log("DELETE Object RESPONSE", res);
        })
        .catch((error) => {
          console.log("DELETE Object ERROR", error);
        });
    }).catch((error) => {
      console.log("ERROR GET_SETTINGS", error);

    });

}

function callLambdaDeleteAssetChild(reachData) {
  return new Promise((resolve, reject) => {
    const lambda = new AWS.Lambda();
    const uuid = reachData.destFilename;
    const payload = {
      "DB_name": "asset_children",
      "query_type": "DELETE_ASSET_CHILD",
      "object": {
        "uuid": uuid
      },
      "where": {
        "url": "thumb_custom"
      }
    };
    lambda.invoke({
      FunctionName: 'DBQuery',
      Payload: JSON.stringify(payload) // pass params
    }).promise().then((data) => {
      console.log("DATA DELETE_ASSET_CHILD", data);
      resolve(data);
    }).catch((error) => {
      console.log("ERROR DELETE_ASSET_CHILD", error);
      reject(error);
    });
  });
}

function createFakeFiles(outputs, reachData) {
  const destUrl = 'user-' + reachData.userID + '/assets/' + reachData.reachType + '/' + reachData.destFilename + '/';
  for (var i = 0; i < outputs.length; i++) {
    const output_filename = outputs[i].filename;
    const fakeFilename = destUrl + output_filename;
    if (output_filename) {
      const createFolderRequest = {
        Bucket: s3Object.bucket.name,
        Key: fakeFilename,
        Body: ''
      };

      s3.putObject(createFolderRequest).promise()
        .then((data) => {})
        .catch((err) => {
          console.log("err", err);
        });
    }
  }
}

function fillOutputs(outputs, outputHeaders, outputUrl) {
  for (var i = 0; i < outputs.length; i++) {
    if (outputs[i].thumbnails) {
      outputs[i].thumbnails.headers = outputHeaders;
      outputs[i].thumbnails.base_url = outputUrl;
    }
    else {
      outputs[i].headers = outputHeaders;
      outputs[i].base_url = outputUrl;
    }
  }
}
