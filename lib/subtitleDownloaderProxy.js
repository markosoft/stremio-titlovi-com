const
    JSZip = require("jszip"),
    unrar = require("node-unrar-js"),
    got = require('got');

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

async function subtitleDownloaderHttpRequest (req, res) {
	try {
		var downloadUrl = decodeURI(req.query.url);
		var season = req.query.season;
		var episode = req.query.episode;

		console.log("Downloading from: " + downloadUrl);
		var rawContent = (await got(downloadUrl)).rawBody;
		var fileContent = await getFileFromZip(rawContent, season, episode) ?? await getFileFromRar(rawContent, season, episode);

		if (fileContent) {
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
}

module.exports = subtitleDownloaderHttpRequest;