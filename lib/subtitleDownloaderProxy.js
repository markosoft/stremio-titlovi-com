const
    JSZip = require("jszip"),
    unrar = require("node-unrar-js"),
	got = require('got');

function filterPath(path, season, episode) {
	var pathLower = path.toLocaleLowerCase();
	// Exclude non-srt ad non-vtt files
	if (!pathLower.endsWith(".srt") && !pathLower.endsWith(".vtt")) {
		return false
	}

	if (season && episode) {
		var match = pathLower.match(/s(\d+).*e(\d+)/);
		if (match && parseInt(match[1], 10) == season && parseInt(match[2], 10) == episode) {
			return true;
		}

		match = pathLower.match(/(\d+)x(\d+)/);
		return match && parseInt(match[1], 10) == season && parseInt(match[2], 10) == episode;
	}

	// If season and episode are not specified, then it's movie and it's always a match.
	return true;
}

async function getFileFromZip(rawContent, season, episode) {
	console.log("Extracting zip...");

	try {
		var zipEntries = await JSZip.loadAsync(rawContent);
		var listOfFiles = Object.keys(zipEntries.files).filter((path) => filterPath(path, season, episode));
		
		if (listOfFiles.length > 0 && zipEntries.file(listOfFiles[0])) {
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

var windows1250Decoder = new TextDecoder("windows-1250");
var windows1251Decoder = new TextDecoder("windows-1251");
var windows1252Decoder = new TextDecoder("windows-1252");

function convertEncoding(contentUint8Array, lang) {
	if (lang == "eng") {
		return windows1252Decoder.decode(contentUint8Array);
	}

	// Macedonian is always cyrillic.
	if (lang == "mkd") {
		return windows1251Decoder.decode(contentUint8Array);
	}

	if (lang == "srp") {
		// 192/224 are А/а in cyrillic and Ŕ/ŕ in latin. Serbian doesn't have Ŕ/ŕ, so if any of these exists, it needs to be cyrillic.
		if (contentUint8Array.includes(192) || contentUint8Array.includes(224))	{
			return windows1251Decoder.decode(contentUint8Array);
		}
	}

	return windows1250Decoder.decode(contentUint8Array);
}

async function subtitleDownloaderHttpRequest (req, res) {
	try {
		var downloadUrl = decodeURI(req.query.url);
		var season = parseInt(req.query.season, 10);
		var episode = parseInt(req.query.episode, 10);
		var lang = req.query.lang;

		console.log("Downloading from: " + downloadUrl);
		var rawContent = (await got(downloadUrl)).rawBody;
		var fileContent = await getFileFromZip(rawContent, season, episode) ?? await getFileFromRar(rawContent, season, episode);
		var encoded = convertEncoding(fileContent, lang);

		if (fileContent) {
			res.setHeader('content-type', 'text/plain');
			res.send(encoded);
			return;
		} else {
			console.log(`No suitable subtitle found in ${downloadUrl}`);
		}
	} catch (e) {
		console.log(e);
	}
	res.status(500).send("error");
}

module.exports = subtitleDownloaderHttpRequest;