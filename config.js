var env = process.argv[2] || 'azure';
var config = {};

switch (env) {
    case 'azure':
		config.port = process.env.PORT
        config.local = "https://stremio-titlovi-com.azurewebsites.net"
        config.username = process.env.username
        config.password = process.env.password
        break;
    case 'local':
        var localSecret = require('./.secret/secret.json');
		config.port = 8095;
        config.local = "http://127.0.0.1:" + config.port;
        config.username = localSecret.username;
        config.password = localSecret.password;
        break;
}

config.subtitleDownloaderController = "downloadSubtitle";

module.exports = config;