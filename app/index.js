#!/usr/bin/env node

console.log("[Server] Booting up ...")

const { publishToCentral, addonBuilder, getRouter} = require("stremio-addon-sdk"),
	landingTemplate = require('../lib/landingTemplate'),
	express = require('express'),
	config = require('../config'),
	subtitleDownloaderHttpRequest = require("../lib/subtitleDownloaderProxy"),
    { subtitleHandler } = require('../addon');

// Docs: https://github.com/Stremio/stremio-addon-sdk/blob/master/docs/api/responses/manifest.md
const manifest = {
	"id": "com.stremio.titlovi",
	"version": "1.1.0",
	"catalogs": [],
	"resources": ["subtitles"],
    "types": ["series","movie"],
    "idPrefixes": ["tt"],
	"name": "Titlovi.com Subtitles",
    "description": "Unofficial subtitle provider for Titlovi.com",
    "logo": "https://static.titlovi.com/titlovicom/Content/Images/logo-big.png"
}
const addon = new addonBuilder(manifest);
addon.defineSubtitlesHandler(subtitleHandler)
var addonInterface = addon.getInterface()

const app = express()
const router = getRouter(addonInterface) // add your addonInterface

const landingHTML = landingTemplate(addonInterface.manifest)
router.get('/', function(req, res, next) {
	res.setHeader('content-type', 'text/html')
	res.end(landingHTML)
})

router.get('/' + config.subtitleDownloaderController + '/*', subtitleDownloaderHttpRequest)

app.use(router)
app.listen(config.port)

console.log("[Server] Started addon at: " + config.local)
console.log("[Server] Install addon from: " + config.local + "/manifest.json")
console.log("[Server] Internal proxy port: " + config.port)
//publishToCentral("https://stremio-titlovi-com.herokuapp.com/manifest.json")	