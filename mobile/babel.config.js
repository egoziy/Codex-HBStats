module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    // react-native-worklets/plugin must be LAST.
    // Required by react-native-reanimated 4.x (transitively used by NativeWind 4 runtime).
    plugins: ['react-native-worklets/plugin'],
  };
};
