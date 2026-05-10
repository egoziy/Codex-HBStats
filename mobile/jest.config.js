module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    // MSW helper files — not test suites themselves
    '/__tests__/msw/',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@shared/(.*)$': '<rootDir>/../shared/$1',
    // MSW v2: jest-expo resolves the react-native export condition which maps
    // msw/node → null and msw → react-native ESM. Map both to CJS node builds.
    '^msw/node$': '<rootDir>/node_modules/msw/lib/node/index.js',
    '^msw$': '<rootDir>/node_modules/msw/lib/core/index.js',
    // rettime and @open-draft/deferred-promise are pure-ESM; use CJS shims.
    '^rettime$': '<rootDir>/__mocks__/rettime.js',
    '^@open-draft/deferred-promise$': '<rootDir>/__mocks__/@open-draft/deferred-promise.js',
  },
  transformIgnorePatterns: [
    // Allow Babel to transform msw, its interceptors, and ESM-only deps
    // (rettime is handled via moduleNameMapper shim, but until-async is not)
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|react-native-css-interop|msw|@mswjs|until-async))',
  ],
};
