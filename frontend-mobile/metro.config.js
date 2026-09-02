const { getDefaultConfig } = require('expo/metro-config');

/* Brand marks are imported as React components rather than bitmaps.
 *
 * The logo appears at sizes from a 20pt nav mark to a 160pt login lockup, and
 * on the free Season Card it stands in for the species photo. Shipping PNGs
 * would mean three sizes of three lockups and a re-export every time the mark
 * is touched; SVG stays crisp at any size and re-colours from the theme. */
const config = getDefaultConfig(__dirname);

config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter(ext => ext !== 'svg');
config.resolver.sourceExts = [...config.resolver.sourceExts, 'svg'];

module.exports = config;
