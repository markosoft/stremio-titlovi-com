const titloviComGetAllSubs = require("./lib/titloviComAccessor");

async function subtitleHandler({type, id, extra}) {
	var fileNameLower = extra.filename?.toLocaleLowerCase();
	var episode = 0;
	var season = 0;
	var imdbId = null;
	if (type == "movie") {
		imdbId = id;
	} else if (type == "series") {
		var parts = id.split(":");
		episode = parts.length >= 3 ? parts[2] : -1;
		season = parts.length >= 2 ? parts[1] : -1;
		imdbId = parts[0];
	}

	var allSubs = await titloviComGetAllSubs(type, imdbId, season, episode, fileNameLower);
	return { subtitles: allSubs };
}

module.exports = { subtitleHandler: subtitleHandler }
