module.exports = function (api) {
  const isTest = api.cache.using(() => process.env.NODE_ENV === 'test');
  return {
    presets: [
      [
        'babel-preset-expo',
        isTest
          ? {}
          : { jsxImportSource: 'nativewind', worklets: false },
      ],
      ...(isTest ? [] : ['nativewind/babel']),
    ],
  };
};
