const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const s3Bucket = "reach-bucket";

exports.handler = (event, context, callback) => {

    /*const deleteParams = {
       Bucket: s3Bucket,
       Delete: {
         Objects: [
            {
             Key: "user-3/assets/sky/95b27f62-4d52-4377-8d96-e5b4d88a1698__Spiderman.mp4"
            }
           ]
         }
     };*/


    var params = {
        Bucket: s3Bucket,
        Prefix: 'user-3/assets/sky/4d2271b1-e5e6-49d0-8755-fab27ff0fb80__pippo.zip/'
    };

    s3.listObjects(params, function(err, data) {
        if (err) return callback(err);


        params = { Bucket: s3Bucket };
        params.Delete = { Objects: [] };

        data.Contents.forEach(function(content) {
            params.Delete.Objects.push({ Key: content.Key });
        });
        
        console.log("ALL PARAMS", JSON.stringify(params));

       s3.deleteObjects(params, function(err, data) {
            console.log("DATA", data);
            console.log("err", err);

        });
    });

    /*

            console.log(`Deleting video src video": ${JSON.stringify(deleteOutputsObjectsRequest)}`);
            s3.deleteObjects(deleteOutputsObjectsRequest)
                .promise()
                .then((delResult) => {
                    console.log("Delete result: ", delResult);
                }).catch((delErr) => {
                    console.log("Delete error: ", delErr);
                });
*/

    /* console.log("deleteParams", JSON.stringify(deleteParams));
     try {
       const deleteResponse = await s3.deleteObjects(deleteParams).promise();
       console.log(deleteResponse);
       
       if (deleteResponse) {
         return deleteResponse;
       } else {

       }
     } catch (error) {
       console.log("ERROR delete ", error);
     }*/
};
