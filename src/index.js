const { handler: releaseHandler } = require('./commands/release');
const { handler: uploadHandler } = require('./commands/upload');

module.exports = { release: releaseHandler, upload: uploadHandler };
