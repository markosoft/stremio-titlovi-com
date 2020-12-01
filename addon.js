const { addonBuilder } = require("stremio-addon-sdk");
const got = require('got');
var JSZip = require("jszip");

var downloaderProxyPort = 8083;//0;

const token = "31856196-42c2-421f-9aa9-61cc11e426dc";
const userId = 231064;

const titloviSearchTemplateUrl = "https://kodi.titlovi.com/api/subtitles/search";
const downloaderProxyUrl = "http://127.0.0.1";

var baseParams = {
	"token": token,
	"userid": userId,
	"json": true
}

var langMapping = {
	"english": "eng",
	"srpski": "srp",
	"cirilica": "srp",
	"hrvatski": "hrv",
	"bosanski": "bos",
	"makedonski": "mkd",
	"slovenski": "slv"
}

var downloadCache = {}

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
const manifest = {
	"id": "community.Titlovicom",
	"version": "0.0.1",
	"catalogs": [],
	"resources": [
		"subtitles"
	],
	"types": ["series","movie"],
	"name": "Titlovi.com",
	"description": "Subtitle provider for Titlovi.com"
}
const builder = new addonBuilder(manifest)

function getRequest(params){
	var paramString = new URLSearchParams(params).toString();
	return got(`${titloviSearchTemplateUrl}?${paramString}`).json();
}

async function getResultsFromAllPages(params) {
	var json = await getRequest(params);

	var currentPage = json.CurrentPage;
	var pagesAvailable = json.PagesAvailable;

	var results = formatSubtitlesEntry(json);
	for (var page = currentPage + 1; page <= pagesAvailable; page++) {
		params['pg'] = page;
		var newResults = formatSubtitlesEntry(await getRequest(params));
		results.push(...newResults);
	}

	return results;
}

function formatSubtitlesEntry(json) {
	return json.SubtitleResults
				.filter(s => s.Lang.toLowerCase() in langMapping)
				.map(s => { return { link: s.Link, lang: langMapping[s.Lang.toLowerCase()], downloadCount: s.DownloadCount, rating: s.Rating, releases: s.Release.split(" / ") };});
}

function sortSubs(allSubs, fileNameLower, sortFirst = "downloadCount", sortSecond = "rating") {
	return allSubs.sort((a, b) => {
		var result = 0;
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

builder.defineSubtitlesHandler(async ({type, id, extra}) => {
	var params = baseParams;
	var fileNameLower = extra.filename.toLocaleLowerCase();
	if (type == "movie") {
		params["query"] = id;
	} else if (type == "series") {
		var parts = id.split(":");
		params["episode"] = parts.length >= 3 ? parts[2] : -1;
		params["season"] = parts.length >= 2 ? parts[1] : -1;
		params["query"] = parts[0];
	}

	var allSubs = await getResultsFromAllPages(params);
	allSubs = sortSubs(allSubs, fileNameLower).map(s => { return { url: `${downloaderProxyUrl}:${downloaderProxyPort}/?url=${encodeURIComponent(s.link)}`, lang: s.lang} });


	var response = { subtitles: allSubs };
	console.log(response);

	return response;
})

module.exports = builder.getInterface()

const app = require('express')();

app.get('/', async function (req, res) {
	var downloadUrl = decodeURI(req.query.url);
	if (downloadCache[downloadUrl]) {
		return downloadCache[downloadUrl];
	}

	console.log("Downloading from: " + downloadUrl);
	var zipContent = (await got(downloadUrl)).rawBody;
	
	var zipEntries = await JSZip.loadAsync(zipContent);

	// Remove non-srt and subtitles with cd1/cd2 tags
	zipEntries.filter((path, file) => { 
		var pathLower = path.toLocaleLowerCase();
		return pathLower.endsWith(".srt"); //&& !pathLower.match(/cd(.| )1|cd(.| )2/i);
	});

	var listOfFiles = Object.keys(zipEntries.files);
	if (listOfFiles.length > 0) {
		// Just take the first one.
		var fileContent = await zipEntries.file(listOfFiles[0]).async("uint8array");
		//downloadCache[downloadUrl] = fileContent;
		res.write(fileContent,'binary');
		res.end(undefined,'binary');
		return;
	}

	res.status(400).send({ message: `No suitable subtitle found in ${downloadUrl}`});
})

const server = app.listen(downloaderProxyPort, () => {
	downloaderProxyPort = server.address().port;
  	console.log('Listening on port:', server.address().port);
});