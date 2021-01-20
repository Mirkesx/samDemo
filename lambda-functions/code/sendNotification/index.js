const AWS = require('aws-sdk');
const s3 = new AWS.S3();

let assetUUID = "";
let assetStatus = "";

let config = {};
exports.handler = (event, context, callback) => {
    // GET CONFIG
    new AWS.Lambda().invoke({
        FunctionName: 'getConfig',
    }).promise().then((configResponse) => {
        config = JSON.parse(configResponse.Payload);
        run(event, context, callback);
    }).catch((err) => { console.log("Missing config", err); });
};

function run(event, context, callback) {
    assetUUID = event.assetUUID;
    assetStatus = event.assetStatus;
    try {
        const options = {
            hostname: config.REACH_BASE_URL,
            port: config.REACH_BASE_URL_PORT,
            path: config.REACH_NOTIFICATION_URL,
            method: 'POST',
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "reach-notification-key": config.REACH_NOTIFICATION_KEY,
                "asset-uuid": assetUUID
            }
        };
        console.log('options', options);
        let req = {};
        if (!config.REACH_BASE_URL_PROTO.startsWith("https")) {
            // PROTOCOL IS HTTP
            const http = require('http');
            req = http.request(options, (res) => { httpCallback(res) });
        }
        else {
            const https = require('https');
            req = https.request(options, (res) => { httpCallback(res) });
        }


        req.on('error', function(e) {
            // ERROR
            console.log('problem with request: ' + e.message);
            const response = {
                statusCode: 500,
                body: JSON.stringify(e),
            };
            return response;
        });

        // write  data to request body
        // CREATING JSON FOR THE DATA TO BE POST
        const apiData = { job: { state: assetStatus } };
        const jsonApiData = JSON.stringify(apiData);
        console.log(`SENDING REQUEST TO SERVER: ${jsonApiData}`);
        req.write(jsonApiData);
        req.end();
    }
    catch (e) {
        console.warn('error: ', e);
        const response = {
            statusCode: 500,
            body: JSON.stringify(e),
        };
        return response;
    }
}

function httpCallback(res) {
    {
        console.log('Response Status: ' + res.statusCode);
        console.log('Response Headers: ' + JSON.stringify(res.headers));
        res.setEncoding('utf8');

        res.on('data', function(body) {
            const errors = JSON.parse(body).errors;
            if (errors) {
                console.log('body.errors', errors);
                const response = {
                    statusCode: 500,
                    body: JSON.stringify(errors),
                };
                return response;
            }
            else {
                // SUCCESS
                console.log('Response Body: ' + body);
                const response = {
                    statusCode: 200,
                    body: JSON.stringify(body),
                };
                return response;
            }
        });

        res.on('error', function(err) {
            // RESPONSE ERROR
            console.log('Response Error: ' + err);
            const response = {
                statusCode: 500,
                body: JSON.stringify(err),
            };
            return response;

        });
    }
}
