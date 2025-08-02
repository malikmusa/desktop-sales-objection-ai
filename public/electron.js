// public/electron.js
// Simple wrapper for electron-builder

const path = require('path');

// Just require the main electron file
require(path.join(__dirname, '..', 'electron', 'main.js'));
