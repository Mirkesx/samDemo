const { Pool, Client } = require('pg')
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

let config = {};
exports.handler = async(event) => {
    // return await run(event);

    // GET CONFIG
    return await new AWS.Lambda().invoke({
        FunctionName: 'getConfig',
    }).promise().then(async(configResponse) => {
        config = JSON.parse(configResponse.Payload);
        return await run(event);
    }).catch((err) => { console.log("Missing config", err); });
};

async function run(event) {
    let DBName = event.DB_name;
    let queryType = event.query_type;
    let object = event.object;
    let where = event.where;
    const pool = new Pool({
        host: config.AWS_DB_HOST,
        port: config.AWS_DB_PORT,
        database: config.AWS_DB_NAME,
        user: config.AWS_DB_USER,
        password: config.AWS_DB_PWD
    });

    try {
        let queryString = "";
        switch (queryType) {
            case "INSERT_ASSETS":
                queryString = insertAsset(object, DBName);
                break;
            case "UPDATE_ASSETS":
                queryString = updateAsset(object, DBName, null);
                break;
            case "INSERT_OR_UPDATE_ASSET":
                const res = await callLambdaToDBQuery(object.uuid);
                console.log("RES callLambdaToDBQuery", res);
                const payload = JSON.parse(res.Payload);
                console.log("INSERT_OR_UPDATE_ASSET: ", payload);
                if (payload.length !== 0) {
                    queryString = updateAsset(object, DBName, payload);
                }
                else {
                    queryString = insertAsset(object, DBName);
                }
                // queryString = queryString + " COMMIT;";
                break;
            case "GET_SETTINGS":
                queryString = selectSetting(object, DBName);
                break;
            case "GET_ASSET":
                queryString = selectAsset(object, DBName);
                break;
            case "GET_ASSETS":
                queryString = selectAssets(object, DBName);
                break;
            case "GET_METADATA_FROM_ASSETS":
                queryString = selectMetadataFromAssets(object, DBName);
                break;
            case "DELETE_ASSET":
                queryString = deleteAsset(object, DBName);
                break;
            case "INSERT_ASSET_CHILD":
                const resp = await callLambdaToDBQuery(object.uuid);
                if (resp) {
                    const payload1 = JSON.parse(resp.Payload);
                    if (payload1 && payload1.length > 0) {
                        const asset = payload1[0];
                        object.asset_id = asset.id;
                    }
                }
                console.log("object", object);
                queryString = insertAssetChild(object, DBName);
                break;
            case "DELETE_ASSET_CHILD":
                const response1 = await callLambdaToDBQuery(object.uuid);
                if (response1) {
                    const payload1 = JSON.parse(response1.Payload);
                    if (payload1 && payload1.length > 0) {
                        const asset = payload1[0];
                        where.asset_id = asset.id;
                    }
                }
                queryString = deleteAssetChild(where, DBName);
                break;
        }

        const res = await pool.query(queryString);
        await pool.end();
        const result = res.rows;
        return result;
    }
    catch (error) {
        await pool.end();
        console.log("ERROR (CATCH)", error);
        return error;

    }
}


function selectMetadataFromAssets(object, DBName) {
    let queryString = "SELECT asset_status,metadata,asset_label FROM " + DBName;
    queryString = queryString + " WHERE uuid= '" + object.uuid + "';";
    return queryString;
}

function selectSetting(object, DBName) {
    let queryString = "SELECT mime,settings FROM " + DBName;
    queryString = queryString + " WHERE mime ILIKE '" + object.mime + "%';";
    //var queryString = "SELECT * FROM transcoding_settings;";
    return queryString;
}

function selectAsset(object, DBName) {
    let queryString = "SELECT * FROM " + DBName;
    queryString = queryString + " WHERE uuid='" + object.uuid + "';";
    return queryString;
}

function selectAssets(object, DBName) {
    let queryString = "SELECT * FROM " + DBName;
    queryString = queryString + " WHERE user_id='" + object.user_id + "' AND asset_type='" + object.asset_type + "';";
    return queryString;
}

function insertAsset(object, DBName) {
    const user_id = object.user_id;
    const asset_type = object.metadata.reachType;
    const metadata = JSON.stringify(object.metadata);
    const transcoding_response = JSON.stringify(object.transcoding_response);
    const uuid = object.uuid;
    const asset_status = object.asset_status;
    let queryString = "INSERT INTO assets(user_id, uuid, metadata, transcoding_response, asset_status, asset_type) values('" + user_id + "','" + uuid + "','" + metadata + "','" + transcoding_response + "','" + asset_status + "','" + asset_type + "')";

    return queryString;
}

function insertAssetChild(object, DBName) {
    const url = object.url;
    const uuid = object.uuid;
    let asset_id = object.asset_id;
    let queryString = "INSERT INTO asset_children(url, asset_id) values('" + url + "','" + asset_id + "');";
    return queryString;
}

function updateAsset(asset, DBName, payload) {
    const user_id = asset.user_id;
    const uuid = asset.uuid;
    let queryString = "UPDATE assets SET ";
    const count = Object.keys(asset).length;
    let increment = 1;
    for (let key in asset) {
        var value = asset[key];
        if (key === "metadata" || key === "transcoding_response") {
            value = JSON.stringify(value);
        }
        if (key === "children" && payload !== null) {
            const element = payload[0].children;
            if (element) {
                value = JSON.stringify({ children: element.children.concat(value.children) });
            }
            else {
                value = JSON.stringify(value);
            }
        }
        queryString = queryString + (" " + key + "= '" + value + "'");
        if (increment < count) {
            queryString = queryString + ",";
            increment = increment + 1;
        }
    }

    queryString = queryString + (" WHERE uuid = '" + uuid + "' AND user_id = '" + user_id + "'");
    queryString = queryString + ";";
    console.log("queryString", queryString);
    return queryString;
}

function deleteAsset(object, DBName) {
    let queryString = "DELETE FROM " + DBName;
    queryString = queryString + " WHERE uuid= '" + object.uuid + "';";
    return queryString;
}

function deleteAssetChild(where, DBName) {
    let queryString = "";

    const count = Object.keys(where).length;
    if (count > 0) {
        queryString = "DELETE FROM " + DBName + " WHERE ";
        let increment = 1;
        for (let key in where) {
            var value = where[key];
            if (key === "url") {
                queryString = queryString + (" " + key + " ILIKE '%" + value + "%'");
            }
            else {
                queryString = queryString + (" " + key + "= '" + value + "'");
            }
            if (increment < count) {
                queryString = queryString + " AND ";
                increment = increment + 1;
            }
        }
        queryString = queryString + ";";
        //queryString = queryString + " WHERE asset_id= '" + object.asset_id + "';";
    }
    console.log("queryString", queryString);
    return queryString;
}

async function callLambdaToDBQuery(uuid) {
    console.log("UUID", uuid);
    const lambda = new AWS.Lambda();
    const payload = {
        "DB_name": "assets",
        "query_type": "GET_ASSET",
        "object": {
            "uuid": uuid
        }
    };
    return lambda.invoke({
        FunctionName: 'DBQuery',
        Payload: JSON.stringify(payload) // pass params
    }).promise();

}
