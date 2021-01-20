exports.handler = (event, context, callback) => {
    const config = {
        ZC_API_HOST_NAME: 'app.zencoder.com',
        ZC_API_HOST_PATH: '/api/v2/jobs',
        ZC_API_HOST_PORT: 443, // HTTPS
        ZC_API_KEY: '27a5cb5298cea0fde536f56a78d70e0b',
        ZC_NOTIFICATION_EMAIL: 'vincenzo.failla@netsenseweb.com',

        AWS_DB_HOST: 'reach.cpw1e3sf6v3d.us-west-1.rds.amazonaws.com',
        AWS_DB_PORT: 5432,
        AWS_DB_NAME: 'emblematic_group',
        AWS_DB_USER: 'emblematic_group',
        AWS_DB_PWD: 'G(Q43S7t$nM|',

        S3_INPUTS_FOLDER_NAME: 'inputs/',
        S3_OUTPUTS_FOLDER_NAME: 'outputs/',

        REACH_BASE_URL_PROTO: 'https://',
        REACH_BASE_URL_PORT: 443,
        REACH_BASE_URL: 'beta.reach.love',//'7c96e601.ngrok.io',
        REACH_NOTIFICATION_URL: '/api/public/notifications/assetstatus',
        REACH_NOTIFICATION_KEY: '2b16ad5c-73c8-4fa5-a6a7-27e40c16f246'
    };
    // TODO implement
    // const response = {
    //     statusCode: 200,
    //     body: config,
    // };
    callback(null, config);
};
