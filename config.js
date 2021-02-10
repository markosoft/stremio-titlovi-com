var env = process.argv[2] || 'heroku';
var config = {};

switch (env) {
    case 'heroku':
		config.port = process.env.PORT
        config.local = "https://stremio-titlovi-com.herokuapp.com"
        config.username = process.env.username
        config.password = process.env.password
        break;
    case 'local':
		config.port = 8095
        config.local = "http://127.0.0.1:" + config.port
        break;
}

config.subtitleDownloaderController = "downloadSubtitle";

module.exports = config;