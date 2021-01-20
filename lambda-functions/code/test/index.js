var AWS = require('aws-sdk');
var https = require('https');
var s3 = new AWS.S3();
var fs = require('fs');

var url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AmazonWebservices_Logo.svg/500px-AmazonWebservices_Logo.svg.png';


function loadConfig(context, callback){

	functionName = context.functionName
	functionArn = context.invokedFunctionArn
	alias = functionArn.split(":").pop()
	prefix = ''

	//the ARN doesn't include an alias token, therefore we must be executing $LATEST
	if (alias == functionName)
		alias = "LATEST"

  if (alias == "LATEST")
    prefix = 'DEV'
  else
    prefix = alias
	
  console.log('prefix:', prefix)

	env_config = {}
	env_config.myVar = process.env[prefix+'_myVar']
	callback(env_config)
}


exports.handler = function(event, context) {
    loadConfig(context, function(env_config){
		console.log('MyVar:', env_config.myVar)
		
    	//do something with config values...
  })
    	
  https.get(url, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      // Agregates chunks
      body += chunk;
    });
    res.on('end', function() {
      // Once you received all chunks, send to S3
      var params = {
        Bucket: 'reach-bucket',
        Key: 'test/aws-logo.png',
        Body: body
      };
      s3.putObject(params, function(err, data) {
        if (err) {
          console.error(err, err.stack);
        } else {
          console.log(data);
        }
      });
    });
  });
};