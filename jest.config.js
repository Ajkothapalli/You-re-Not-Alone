module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(' + [
      'jest-expo',
      'expo',
      '@expo',
      'expo-modules-core',
      'expo-web-browser',
      'expo-linking',
      'expo-haptics',
      'expo-apple-authentication',
      'expo-speech-recognition',
      // lib/dictation.ts imports it for the on-device recogniser's locale, so
      // any suite touching the write screen loads it. Ships untranspiled ESM.
      'expo-localization',
      '@breezystack/lamejs',
      // Imported via components/VoiceComposer -> app/write.tsx. Without it BOTH
      // dictation suites stopped running entirely — 44 tests vanished while the
      // failure count stayed at 8, which reads as "nothing broke".
      'expo-audio',
      'expo-asset',      // pulled in by expo-audio
      'expo-sharing',
      'expo-font',
      'expo-status-bar',
      'expo-splash-screen',
      'react-native',
      '@react-native',
      '@react-navigation',
      'react-native-reanimated',
      'react-native-worklets',
      'react-native-svg',
      'react-native-safe-area-context',
      'react-native-purchases',
      '@supabase',
    ].join('|') + ')/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // @breezystack/lamejs ships an IIFE as its CJS entry, which exports NOTHING
    // when jest requires it — `new Mp3Encoder()` then fails with "not a
    // constructor" while working fine in the app, because Metro resolves the
    // ESM build. Point jest at the same build Metro uses.
    '^@breezystack/lamejs$': '<rootDir>/node_modules/@breezystack/lamejs/dist/lamejs.js',
  },
  // '/.claude/' keeps agent worktrees out of the run. A worktree under
  // .claude/worktrees/ is a full second checkout, so without this jest
  // collects both copies of every test: the totals inflate, and a stale
  // worktree's failures get reported as if they were this branch's.
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.claude/'],
};
