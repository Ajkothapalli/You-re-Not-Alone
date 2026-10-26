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
      // ── Added for the renderRouter suites (__tests__/nav) ─────────────────
      // They load the REAL router instead of the mock in jest.setup.js.
      'expo-router',
      'expo-constants',      // expo-router reads the manifest through it
      'standard-navigation', // expo-router's own dep, untranspiled ESM
      // Reached through components/share/* when the feed screen is rendered.
      'react-native-view-shot',
      'expo-glass-effect',   // pulled in by expo-router's tab bar
      //
      // NOT 'expo-.*'. The blanket pattern was tried and reverted: it makes
      // __tests__/lib/mp3Encode.test.ts take 990 SECONDS instead of 8, at 1%
      // CPU — so something it newly transforms replaces setTimeout with
      // something that resolves on the order of tens of seconds, and
      // encodeMp3 yields to the event loop ~50 times. Nothing fails; the
      // suite just stops finishing. Add packages one at a time and keep the
      // timing of the full run in view.
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
