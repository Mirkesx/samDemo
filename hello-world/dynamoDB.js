// const axios = require('axios')
// const url = 'http://checkip.amazonaws.com/';
let response;

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */

console.log('Loading function');

exports.dynamoDBHandler = function(event, context, callback) {
    console.log(JSON.stringify(event, null, 2));
    event.Records.forEach(function(record) {
        console.log(record.eventID);
        console.log(record.eventName);
        console.log('DynamoDB Record: %j', record.dynamodb);
    });
    callback(null, "message");
};

const databaseManager = require('./databaseManager');
const { v4: uuidv4 } = require('uuid');

exports.productHandler = function(event, context, callback){

    console.log(event, context);

    switch (event.httpMethod) {
		case 'DELETE':
			deleteItem(event, callback);
			break;
		case 'GET':
			getItem(event, callback);
			break;
		case 'POST':
			saveItem(event, callback);
			break;
		case 'PUT':
			updateItem(event, callback);
			break;
		default:
			sendResponse(404, `Unsupported method "${event.httpMethod}"`, callback);
	}
};

function saveItem(event, callback) {
	const item = JSON.parse(event.body);

	item.productId = uuidv4();

	databaseManager.saveItem(item).then(response => {
		console.log(response);
		sendResponse(200, item.productId, callback);
	}, (reject) =>{
		sendResponse(400, reject, callback);
	});
}

function getItem(event, callback) {
	const itemId = event.pathParameters.productId;

	databaseManager.getItem(itemId).then(response => {
		console.log(response);
		if(response)
			sendResponse(200, response, callback);
		else
		sendResponse(404, "Please passa valid productId", callback);

	},(reject) =>{
		sendResponse(400, reject, callback);
	});
}

function deleteItem(event, callback) {
	const itemId = event.pathParameters.productId;

	databaseManager.deleteItem(itemId).then(response => {
		sendResponse(200, 'DELETE ITEM', callback);
	}, (reject) => {
		sendResponse(400, reject, callback);
	});
}

function updateItem(event, callback) {
	const itemId = event.pathParameters.productId;

	const body = JSON.parse(event.body);
	
	databaseManager.updateItem(itemId, body).then(response => {
		console.log(response);
		sendResponse(200, response, callback);
	}, (reject) => {
		sendResponse(400, reject, callback);
	});
}

function sendResponse(statusCode, message, callback) {
	const response = {
		statusCode: statusCode,
		body: JSON.stringify(message)
	};
	callback(null, response);
}
