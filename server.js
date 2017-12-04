/* eslint-env node */
'use strict';
const ns = require('node-static');
const opn = require('opn');
const url = require('url');

const portIdx = 3;
const defaultPort = 8092;
const port = parseInt(process.argv[portIdx] || defaultPort, 10);

const file = new ns.Server(undefined, {cache: false});

require('http').createServer(function (req, res) {
    req.addListener('end', function () {
        file.serve(req, res);
    }).resume();
}).listen(port);

const siteIdx = 2;
const defaultURL = 'http://127.0.0.1/';
let site = process.argv[siteIdx]
    ? `http://127.0.0.1:${port}/` + process.argv[siteIdx]
    : defaultURL;

if (port !== defaultPort) {
    const portAdded = url.parse(site);
    portAdded.host = portAdded.host.replace(/:.*$/, '') + ':' + port;
    site = url.format(portAdded);
}

if (site === '0') {
    console.log('Started server; open a file within ' + defaultURL + ':' + port + ' in the browser. Tests may take a while to load!'); // eslint-disable-line no-console
} else {
    console.log('Started server; opening ' + site + ' in the browser.' + (site.match(/test/) ? ' May take a while to load!' : '')); // eslint-disable-line no-console
    opn(site);
}
