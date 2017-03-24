const path = require('path');
const WebpackConfig = require('../WebpackConfig');
const fs = require('fs-extra');
const Browser = require('zombie');
const httpServer = require('http-server');
const configGenerator = require('../config-generator');
const webpack = require('webpack');
const assertUtil = require('./assert');

const testDir = path.join(__dirname, '../', '../', 'test');
const testProjectDir = path.join(testDir, 'project');
const testFixturesDir = path.join(testDir, 'fixtures');

var temporaryFiles = [];
var servers = [];

/**
 * @param outputDirName
 * @param nodeEnvironment
 * @returns {WebpackConfig}
 */
function createWebpackConfig(outputDirName = '', nodeEnvironment = 'dev') {
    const config = new WebpackConfig(testFixturesDir, nodeEnvironment);

    if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir);
    }

    const outputPath = path.join(testProjectDir, outputDirName);
    // allows us to create a few levels deep without issues
    fs.mkdirsSync(outputPath);
    config.setOutputPath(path.join(testProjectDir, outputDirName));

    return config;
}

function runWebpack(webpackConfig, callback) {
    const compiler = webpack(configGenerator(webpackConfig));
    compiler.run((err, stats) => {
        if (err) {
            console.error(err.stack || err);
            if (err.details) {
              console.error(err.details);
            }

            throw new Error(`Error running webpack!`);
        }

        const info = stats.toJson();

        if (stats.hasErrors()) {
            console.error(info.errors);

            throw new Error(`Compilation error running webpack!`);
        }

        if (stats.hasWarnings()) {
            console.warn(info.warnings)
        }

        callback(assertUtil(webpackConfig));
    });
}

function emptyTestDir() {
    fs.emptyDirSync(testProjectDir);
}

function saveTemporaryFileToFixturesDirectory(filename, contents) {
    const tmpFilePath = path.join(testFixturesDir, filename);
    fs.writeFileSync(
        tmpFilePath,
        contents
    );

    temporaryFiles.push(tmpFilePath);
}

function deleteTemporaryFiles() {
    for (let filePath of temporaryFiles) {
        fs.unlinkSync(filePath);
    }

    temporaryFiles = [];
}

function startHttpServer(port, webRoot) {
    var server = httpServer.createServer({
        root: webRoot
    });

    server.listen(port, '0.0.0.0');
    servers.push(server);
}

function stopAllServers() {
    for (let server of servers) {
        server.close();
    }

    servers = [];
}

/**
 * Creates a testing.html file with specified script and link tags,
 * makes a request to it, and executes a callback, passing that
 * the Browser instance used to make the request.
 *
 * @param webRootDir          Directory name (e.g. public) where the web server should be rooted
 * @param {Array} scriptSrcs  Used to create <script src=""> tags.
 * @param {Function} callback Called after the page was requested.
 */
function requestTestPage(webRootDir, scriptSrcs, callback) {
    var scripts = '';
    for (let scriptSrc of scriptSrcs) {
        scripts += `<script src="${scriptSrc}"></script>`
    }

    const testHtml = `
<html>
<head>
</head>
<body>
	${scripts}
</body>
</html>
`;

    const webRoot = path.join(testProjectDir, webRootDir);

    // write the testing.html file
    fs.writeFileSync(
        path.join(webRoot, 'testing.html'),
        testHtml
    );

    // start the main local server
    startHttpServer('8080', webRoot);
    // start a secondary server - can be used as the "CDN"
    startHttpServer('8090', webRoot);

    const browser = new Browser();
    browser.on('error', function (error) {
        throw new Error(error);
    });
    browser.visit('http://127.0.0.1:8080/testing.html', () => {
        stopAllServers();
        callback(browser);
    });
}

module.exports = {
    createWebpackConfig,
    runWebpack,
    emptyTestDir,
    requestTestPage,
    saveTemporaryFileToFixturesDirectory,
    deleteTemporaryFiles
};