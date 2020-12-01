const { addonBuilder } = require("stremio-addon-sdk");
const got = require('got');
var JSZip = require("jszip");
var unrar = require("node-unrar-js");

const cache = {};

var downloaderProxyPort = 8083;//0;

const token = "31856196-42c2-421f-9aa9-61cc11e426dc";
const userId = 231064;

const titloviSearchTemplateUrl = "https://kodi.titlovi.com/api/subtitles/search";
const downloaderProxyUrl = "http://127.0.0.1";
const titloviSubIdPrefix = "[Titlovi] "; 

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

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
const manifest = {
	"id": "com.stremio.titlovi",
	"version": "1.0.0",
	"catalogs": [],
	"resources": [
		"subtitles"
	],
	"types": ["series","movie"],
	"name": "Titlovi.com",
	"description": "Unofficial subtitle provider for Titlovi.com"
}
const builder = new addonBuilder(manifest)

function getRequest(params){
	var paramString = new URLSearchParams(params).toString();
	var url = `${titloviSearchTemplateUrl}?${paramString}`;
	console.log("Getting list from: " + url)
	return got(url).json();
}

async function getResultsFromAllPages(params) {
	params['pg'] = 1;
	var json = await getRequest(params);

	var currentPage = json.CurrentPage;
	var pagesAvailable = json.PagesAvailable;

	var results = formatSubtitlesEntry(json, titloviSubIdPrefix);
	for (var page = currentPage + 1; page <= pagesAvailable; page++) {
		params['pg'] = page;
		var newResults = formatSubtitlesEntry(await getRequest(params), titloviSubIdPrefix);
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

builder.defineSubtitlesHandler(async ({type, id, extra}) => {
	var params = baseParams;
	var fileNameLower = extra.filename?.toLocaleLowerCase();
	var episode = 0;
	var season = 0;
	if (type == "movie") {
		params["query"] = id;
	} else if (type == "series") {
		var parts = id.split(":");
		params["episode"] = episode = parts.length >= 3 ? parts[2] : -1;
		params["season"] = season = parts.length >= 2 ? parts[1] : -1;
		params["query"] = parts[0];
	}

	var allSubs = await getResultsFromAllPages(params);

	// Get whole-season and whole-series subs
	if (type == "series") {
		params["episode"] = 0;
		allSubs.push(...await getResultsFromAllPages(params));

		params["season"] = 0;
		allSubs.push(...await getResultsFromAllPages(params));
	}

	allSubs = sortSubs(allSubs, fileNameLower).map(s => {
		return {
			url: `${downloaderProxyUrl}:${downloaderProxyPort}/?url=${encodeURIComponent(s.link)}` + (s.episode == 0 ? `&season=${season}&episode=${episode}` : ""),
			lang: s.lang,
			id: s.id
		};
	});

	return { subtitles: allSubs };
})

module.exports = builder.getInterface()

const app = require('express')();

function filterPath(path, season, episode) {
	var pathLower = path.toLocaleLowerCase();
	// Exclude non-srt files
	if (!pathLower.endsWith(".srt")) {
		return false
	}

	if (season && episode) {
		var match = pathLower.match(/s(\d)+e(\d)+/);
		return match && match[1] == season && match[2] == episode;
	}

	return true;
}

async function getFileFromZip(rawContent, season, episode) {
	console.log("Extracting zip...");

	try {
		var zipEntries = await JSZip.loadAsync(rawContent);

		zipEntries.filter((path) => filterPath(path, season, episode));

		var listOfFiles = Object.keys(zipEntries.files);
		if (listOfFiles.length > 0) {
			// Just take the first one.
			var fileContent = await zipEntries.file(listOfFiles[0]).async("uint8array");
			return fileContent;
		}
	} catch (e) {
		// If zip extraction fails, just ignore it.
		console.log(e);
	}

	return null;
}

async function getFileFromRar(rawContent, season, episode) {
	console.log("Extracting rar...");

	try {
		var extractor = unrar.createExtractorFromData(rawContent);
		const list = extractor.getFileList();
		if (list[0].state === "SUCCESS") {
			var listOfFiles = list[1].fileHeaders.map(header => header.name).filter(path => filterPath(path, season, episode));

			if (listOfFiles.length > 0) {
				// Just take the first one.
				var extracted = extractor.extractFiles([listOfFiles[0]]);
				if (extracted[0].state === "SUCCESS") {
					if (extracted[1].files[0].extract[0].state === "SUCCESS") {
						return extracted[1].files[0].extract[1]; // Uint8Array 
					}
				}
			}
		}
	} catch (e) {
		// If rar extraction fails, just ignore it.
		console.log(e);
	}

	return null;
}

app.get('/', async function (req, res) {
	try {
		var fromCache = cache[req.originalUrl];
		if (fromCache) {
			console.log("Cache hit for: " + req.originalUrl);
			res.write(fromCache,'binary');
			res.end(undefined,'binary');
			return;
		}

		var downloadUrl = decodeURI(req.query.url);
		var season = req.query.season;
		var episode = req.query.episode;

		console.log("Downloading from: " + downloadUrl);
		var rawContent = (await got(downloadUrl)).rawBody;
		var fileContent = await getFileFromZip(rawContent, season, episode) ?? await getFileFromRar(rawContent, season, episode);

		if (fileContent) {
			cache[req.originalUrl] = fileContent;
			res.write(fileContent,'binary');
			res.end(undefined,'binary');
			return;
		} else {
			console.log(`No suitable subtitle found in ${downloadUrl}`);
		}
	} catch (e) {
		console.log(e);
	}
	res.status(500).send("error");
})

const server = app.listen(downloaderProxyPort, () => {
	downloaderProxyPort = server.address().port;
  	console.log('Listening on port:', server.address().port);
});