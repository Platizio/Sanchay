// Expo SDK 52+ configures monorepo watchFolders and package "exports" resolution automatically.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
