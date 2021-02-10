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
		var match = pathLower.match(/s(\d+)e(\d+)/);
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

async function subtitleDownloaderHttpRequest (req, res) {
	try {
		var downloadUrl = decodeURI(req.query.url);
		var season = parseInt(req.query.season, 10);
		var episode = parseInt(req.query.episode, 10);

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