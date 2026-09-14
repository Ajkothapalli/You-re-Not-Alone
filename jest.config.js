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
  },
  // '/.claude/' keeps agent worktrees out of the run. A worktree under
  // .claude/worktrees/ is a full second checkout, so without this jest
  // collects both copies of every test: the totals inflate, and a stale
  // worktree's failures get reported as if they were this branch's.
  testPathIgnorePatterns: ['/node_modules/', '/ios/', '/android/', '/.claude/'],
};
