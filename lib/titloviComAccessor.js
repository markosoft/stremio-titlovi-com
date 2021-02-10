const
    got = require('got'),
    config = require('../config');

const titloviApiUrl = "https://kodi.titlovi.com/api/subtitles";
const titloviGetTokenSuffix = "gettoken";
const titloviSearchSuffix = "search";
const titloviSubIdPrefix = "[Titlovi] "; 

var langMapping = {
	"english": "eng",
	"srpski": "srp",
	"cirilica": "srp",
	"hrvatski": "hrv",
	"bosanski": "bos",
	"makedonski": "mkd",
	"slovenski": "slv"
}

function getRequest(params, urlSuffix){
	var paramString = new URLSearchParams(params).toString();
	var url = `${titloviApiUrl}/${urlSuffix}?${paramString}`;

    return got(url).json();
}

function postRequest(params, urlSuffix){
	var paramString = new URLSearchParams(params).toString();
    const client = got.extend({
        prefixUrl: titloviApiUrl,
        headers: {}
    });

    return client.post(`${urlSuffix}?${paramString}`).json();
}

async function getResultsFromAllPages(params) {
    params['pg'] = 1;
	var json = await getRequest(params, titloviSearchSuffix);

	var currentPage = json.CurrentPage;
	var pagesAvailable = json.PagesAvailable;

	var results = formatSubtitlesEntry(json, titloviSubIdPrefix);
	for (var page = currentPage + 1; page <= pagesAvailable; page++) {
		params['pg'] = page;
		var newResults = formatSubtitlesEntry(await getRequest(params, titloviSearchSuffix), titloviSubIdPrefix);
		results.push(...newResults);
	}

	return results;
}

function formatSubtitlesEntry(json, subIdPrefix) {
	return json.SubtitleResults
				.filter(s => s.Lang.toLowerCase() in langMapping)
				.map(s => { return { link: s.Link, lang: langMapping[s.Lang.toLowerCase()], downloadCount: s.DownloadCount, rating: s.Rating, releases: s.Release.split(" / "), id: subIdPrefix + s.Id, season: s.Season, episode: s.Episode };});
}

function sortSubs(allSubs, fileNameLower, sortFirst = "downloadCount", sortSecond = "rating") {
	return allSubs.sort((a, b) => {
		var result = 0;

		// Sort by matching release first.
		if (fileNameLower) {
			for (var release of a.releases) {
				if (fileNameLower.includes(release.toLocaleLowerCase())) {
					result -= 1;
					break;
				}
			}
	
			for (var release of b.releases) {
				if (fileNameLower.includes(release.toLocaleLowerCase())) {
					result += 1;
					break;
				}
			}
		}	

		if (result != 0) {
			return result;
		}

		result = b[sortFirst] - a[sortFirst];
		if (result != 0) {
			return result;
		}

		return b[sortSecond] - a[sortSecond];
	});
}

async function getAllSubs(type, imdbId, season, episode, fileNameLower) {
    var tokenJsonResponse = await postRequest({ "username": config.username, "password": config.password, "json": true }, titloviGetTokenSuffix);
    var params = {
		"token": tokenJsonResponse.Token,
		"userid": tokenJsonResponse.UserId,
		"json": true
    }
    
    params["query"] = imdbId;
    if (type == "series") {
		params["episode"] = episode;
		params["season"] = season;
	}

	var allSubs = await getResultsFromAllPages(params);

	// Get whole-season and whole-series subs
	if (type == "series") {
		params["episode"] = 0;
		allSubs.push(...await getResultsFromAllPages(params));

		params["season"] = 0;
		allSubs.push(...await getResultsFromAllPages(params));
    }
    
    return sortSubs(allSubs, fileNameLower).map(s => {
        var tempUrl = `${config.local}/${config.subtitleDownloaderController}/?url=${encodeURIComponent(s.link)}` + (s.episode == 0 ? `&season=${season}&episode=${episode}` : "")
		return {
			url: tempUrl,
			lang: s.lang,
			id: s.id
		};
	});
}

module.exports = getAllSubs;