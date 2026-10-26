// AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// react-native-svg — return plain Views so renders don't crash.
// testID is forwarded when explicitly set; falls back to the element name.
jest.mock('react-native-svg', () => {
  const React    = require('react');
  const { View } = require('react-native');
  const mock = (name) => {
    const C = ({ children, testID, transform, style, ...rest }) =>
      React.createElement(
        View,
        { testID: testID !== undefined ? testID : name, transform, style },
        children,
      );
    C.displayName = name;
    return C;
  };
  return {
    __esModule:     true,
    default:        mock('Svg'),
    Svg:            mock('Svg'),
    Circle:         mock('Circle'),
    Ellipse:        mock('Ellipse'),
    G:              mock('G'),
    Path:           mock('Path'),
    Rect:           mock('Rect'),
    Defs:           mock('Defs'),
    LinearGradient: mock('LinearGradient'),
    RadialGradient: mock('RadialGradient'),
    Stop:           mock('Stop'),
    // Filter primitives. ScrawlIcon imports all three and renders them whenever
    // roughen is set (its default), so omitting them made every icon resolve to
    // `undefined` and React threw "Element type is invalid" — which surfaced as
    // six unrelated-looking failures in ReadCard's felt-interaction tests, none
    // of which mention SVG. Any component drawing a roughened icon hits this.
    Filter:             mock('Filter'),
    FeTurbulence:       mock('FeTurbulence'),
    FeDisplacementMap:  mock('FeDisplacementMap'),
    FeColorMatrix:      mock('FeColorMatrix'),
    FeGaussianBlur:     mock('FeGaussianBlur'),
    FeOffset:           mock('FeOffset'),
    FeMerge:            mock('FeMerge'),
    FeMergeNode:        mock('FeMergeNode'),
    ClipPath:           mock('ClipPath'),
    Mask:               mock('Mask'),
    Line:               mock('Line'),
    Polygon:            mock('Polygon'),
    Polyline:           mock('Polyline'),
    Text:               mock('Text'),
    TSpan:              mock('TSpan'),
    Use:                mock('Use'),
    Symbol:             mock('Symbol'),
    Image:              mock('Image'),
    Pattern:            mock('Pattern'),
  };
});

// react-native-purchases
jest.mock('react-native-purchases', () => ({
  configure:           jest.fn(),
  getCustomerInfo:     jest.fn().mockResolvedValue({ customerInfo: {} }),
  getOfferings:        jest.fn().mockResolvedValue({ current: null }),
  purchasePackage:     jest.fn().mockResolvedValue({}),
  restorePurchases:    jest.fn().mockResolvedValue({}),
  PurchasesError:      class PurchasesError extends Error {},
  PURCHASES_ERROR_CODE: {},
}));

// react-native-reanimated
//
// NOT `require('react-native-reanimated/mock')` — that mock pulls in the real
// reanimated entry, which loads react-native-worklets' native bindings and
// THROWS. Because jest.mock factories are lazy, this global mock only ran in
// suites that actually reach reanimated, so for a long time it looked fine:
// the scene suites had each pasted their own inline mock to dodge it, and
// everything else never touched it. The moment any other screen imported an
// illustration, its suite died on a mock that had never worked.
//
// Keep this in sync with the shape the scenes use (see components/
// illustrations/behaviours/*). Suites needing to assert on calls still define
// their own factory, which overrides this one.
jest.mock('react-native-reanimated', () => {
  const identity = (v) => v;
  const makeEasing = () => identity;
  const RN = require('react-native');
  /**
   * [S2] Animated.View and friends.
   *
   * The default export used to carry only createAnimatedComponent, so
   * `Animated.View` was undefined — which surfaces as "Element type is
   * invalid ... Check the render method of `Deck`", pointing at the
   * component rather than at the mock. Every animated primitive the app
   * uses has to be here.
   */
  const animated = {
    createAnimatedComponent: (c) => c,
    View:       RN.View,
    Text:       RN.Text,
    ScrollView: RN.ScrollView,
    Image:      RN.Image,
  };
  return {
    __esModule: true,
    default: animated,
    ...animated,
    useSharedValue:   jest.fn((init) => ({ value: init })),
    useAnimatedProps: jest.fn((fn) => fn()),
    useAnimatedStyle: jest.fn((fn) => fn()),
    withRepeat:       jest.fn((anim) => anim),
    withTiming:       jest.fn((val) => val),
    withDelay:        jest.fn((_, anim) => anim),
    withSequence:     jest.fn((...anims) => anims[anims.length - 1]),
    cancelAnimation:  jest.fn(),
    // [S2] The deck interpolates the pile's rise from the drag. Without
    // these the whole deck throws "Cannot read properties of undefined
    // (reading 'CLAMP')" and every deck test fails on the mock rather than
    // on anything real.
    interpolate: jest.fn((v, inRange, outRange) => {
      const [i0, i1] = inRange;
      const [o0, o1] = outRange;
      const t = i1 === i0 ? 0 : (v - i0) / (i1 - i0);
      return o0 + Math.min(Math.max(t, 0), 1) * (o1 - o0);
    }),
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    Extrapolate:   { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    runOnJS: (fn) => fn,
    useAnimatedRef: jest.fn(() => ({ current: null })),
    /**
     * Reanimated's own event plumbing. Kept after gesture-handler was
     * removed: these are part of the library's surface, and a mock that
     * only covers what today's callers happen to use is a landmine for
     * the next one.
     */
    useEvent:              jest.fn(() => ({})),
    useHandler:            jest.fn(() => ({ context: {}, doDependenciesDiffer: false })),
    useComposedEventHandler: jest.fn(() => ({})),
    setGestureState:       jest.fn(),
    isSharedValue:         jest.fn(() => false),
    makeMutable:           jest.fn((v) => ({ value: v })),
    ReduceMotion: { Never: 'never', Always: 'always', System: 'system' },
    Easing: {
      linear:  identity,
      out:     makeEasing,
      in:      makeEasing,
      inOut:   makeEasing,
      sin:     identity,
      cubic:   identity,
      quad:    identity,
      bezier:  makeEasing,
      elastic: makeEasing,
      back:    makeEasing,
    },
  };
});

// expo-web-browser
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync:    jest.fn().mockResolvedValue({ type: 'cancel' }),
  dismissBrowser:          jest.fn(),
  maybeCompleteAuthSession: jest.fn(),
  openBrowserAsync:        jest.fn().mockResolvedValue({ type: 'cancel' }),
}));

// expo-linking
jest.mock('expo-linking', () => ({
  createURL:       jest.fn((path) => `soulyap://${path}`),
  getInitialURL:   jest.fn().mockResolvedValue(null),
  addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
}));

// expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync:         jest.fn().mockResolvedValue(undefined),
  selectionAsync:      jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}));

// expo-apple-authentication
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(false),
  signInAsync:      jest.fn(),
  AppleAuthenticationScope: { EMAIL: 'email', FULL_NAME: 'fullName' },
}));

// expo-notifications
//
// Mocked rather than transformed. The real module imports isRunningInExpoGo
// from `expo` (untransformed ESM) and reaches for a native module that does
// not exist under jest — so every screen that so much as imports it would
// fail to parse.
//
// The DEFAULTS MATTER: getPermissionsAsync reports undetermined, which is
// the state the ask flow is designed around. A mock that reported `granted`
// would make every eligibility test pass for the wrong reason.
jest.mock('expo-notifications', () => ({
  getPermissionsAsync:     jest.fn().mockResolvedValue({
    granted: false, status: 'undetermined', canAskAgain: true,
  }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({
    granted: false, status: 'denied', canAskAgain: true,
  }),
  getExpoPushTokenAsync:   jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  setNotificationHandler:  jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  AndroidImportance:           { DEFAULT: 3, HIGH: 4, LOW: 2 },
  AndroidNotificationVisibility: { UNKNOWN: 0, PUBLIC: 1, PRIVATE: 2, SECRET: 3 },
}));

// expo-localization
jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ timeZone: 'Asia/Kolkata' }]),
  getLocales:   jest.fn(() => [{ languageCode: 'en', regionCode: 'IN' }]),
}));

// expo-router
//
// Every method the app actually calls has to be here. A missing one is not an
// obvious failure: the call throws inside a try/catch somewhere and the test
// fails several assertions later, on a screen that simply never updated.
// That is exactly what happened when Phase NAV introduced navigate/dismissTo/
// setParams — the mock stopped at replace/push/back and the voice screen
// looked like it had a reset bug. Keep this in step with:
//   grep -rho "router\.[a-zA-Z]*" app components lib | sort -u
jest.mock('expo-router', () => ({
  router: {
    replace:   jest.fn(),
    push:      jest.fn(),
    navigate:  jest.fn(),
    dismissTo: jest.fn(),
    back:      jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
  },
  useRouter: jest.fn(() => ({
    replace:   jest.fn(),
    push:      jest.fn(),
    navigate:  jest.fn(),
    dismissTo: jest.fn(),
    back:      jest.fn(),
    canGoBack: jest.fn(() => true),
    setParams: jest.fn(),
  })),
  useLocalSearchParams:   jest.fn(() => ({})),
  usePathname:            jest.fn(() => '/'),
  useSegments:            jest.fn(() => []),
  /**
   * Runs the effect, like the real one does when a screen mounts focused.
   *
   * It was a bare jest.fn() — a no-op — from Phase NAV until H1, which meant
   * every focus effect in the app silently did nothing under test: the Alerts
   * fetch, the You fetch, the feed's playback cleanup. Nothing failed; the
   * screens just rendered empty, which reads as a component bug rather than
   * as a mock that quietly disabled half the app.
   *
   * The cleanup is returned so blur behaviour (stopAllPlayback, dismissing
   * the keyboard) is exercised on unmount rather than skipped.
   */
  useFocusEffect: (cb) => {
    const React = require('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => cb(), [cb]);
  },
  // The root layout's dev-only single-(tabs) guard reads this. An undefined
  // return is a state the guard must tolerate anyway (the tree is not mounted
  // on the first render), so it is the honest default.
  useRootNavigationState: jest.fn(() => undefined),
  Link:                   ({ children }) => children,
  Stack:                  { Screen: () => null },
  Tabs:                   Object.assign(() => null, { Screen: () => null }),
}));

// react-native-safe-area-context
//
// The CONTEXTS are real React contexts with a real default, not stubs. Several
// things read them with React.use() — expo-router's SafeAreaProviderCompat
// among them — and `use(undefined)` is a hard throw ("An unsupported type was
// passed to use()"), not a graceful degradation.
jest.mock('react-native-safe-area-context', () => {
  // Required inside the factory: jest hoists these above every import, so a
  // module-scope binding would not exist yet when this runs.
  const React = require('react');
  const ZERO  = { top: 0, bottom: 0, left: 0, right: 0 };
  const FRAME = { x: 0, y: 0, width: 390, height: 844 };
  return {
    useSafeAreaInsets:     jest.fn(() => ZERO),
    useSafeAreaFrame:      jest.fn(() => FRAME),
    SafeAreaProvider:      ({ children }) => children,
    SafeAreaView:          ({ children }) => children,
    SafeAreaInsetsContext: React.createContext(ZERO),
    SafeAreaFrameContext:  React.createContext(FRAME),
    initialWindowMetrics:  { insets: ZERO, frame: FRAME },
  };
});

// expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: ({ children, ...p }) => require('react').createElement(View, p, children) };
});

// supabase client
jest.mock('@/lib/supabase', () => {
  const makeQB = () => {
    const qb = {
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      limit:       jest.fn().mockReturnThis(),
      upsert:      jest.fn().mockResolvedValue({ data: null, error: null }),
      insert:      jest.fn().mockResolvedValue({ data: null, error: null }),
      update:      jest.fn().mockResolvedValue({ data: null, error: null }),
      ilike:       jest.fn().mockReturnThis(),
    };
    return qb;
  };
  return {
    supabase: {
      auth: {
        getSession:             jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
        getUser:                jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
        signInWithOtp:          jest.fn().mockResolvedValue({ data: {}, error: null }),
        signInWithOAuth:        jest.fn().mockResolvedValue({ data: { url: 'https://mock-oauth.example.com' }, error: null }),
        exchangeCodeForSession: jest.fn().mockResolvedValue({ data: {}, error: null }),
        setSession:             jest.fn().mockResolvedValue({ data: {}, error: null }),
        verifyOtp:              jest.fn().mockResolvedValue({ data: {}, error: null }),
        signOut:                jest.fn().mockResolvedValue({ error: null }),
        signInWithIdToken:      jest.fn().mockResolvedValue({ data: {}, error: null }),
        onAuthStateChange:      jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      },
      from:      jest.fn().mockReturnValue(makeQB()),
      functions: { invoke: jest.fn().mockResolvedValue({ data: {}, error: null }) },
      rpc:       jest.fn().mockResolvedValue({ data: [], error: null }),
    },
  };
});

// expo-file-system
//
// lib/voiceSubmit.ts imports File for local-recording cleanup, so every suite
// that reaches the write screen loads it. Ships untranspiled TS.
//
// The mock is a real in-memory filesystem rather than a set of jest.fn()s,
// because the thing tests must be able to assert is whether the recording was
// actually DELETED — "was delete() called" is weaker than "is the file gone",
// and the guarantee here is that a voice recording does not outlive its
// submission.
const mockFs = new Map();
jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri;
    constructor(uri) { this.uri = typeof uri === 'string' ? uri : String(uri); }
    get exists() { return mockFs.has(this.uri); }
    delete() { mockFs.delete(this.uri); }
    bytes() { return Promise.resolve(mockFs.get(this.uri) ?? new Uint8Array()); }
  },
  Paths: { cache: 'file:///cache', document: 'file:///documents' },
  __mockFs: mockFs,
}));

// expo-audio
//
// Mocked rather than transformed: it pulls in expo-asset -> expo-constants ->
// expo-modules-core, all untranspiled ESM, and adding each to
// transformIgnorePatterns in turn is chasing a chain that will grow again. No
// test here exercises real playback; the ones that care about audio assert on
// what is UPLOADED and STORED, not on the player.
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({
    play:   jest.fn(),
    pause:  jest.fn(),
    seekTo: jest.fn(),
    remove: jest.fn(),
  }),
  useAudioPlayerStatus: () => ({ playing: false, didJustFinish: false, currentTime: 0 }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));

// expo-font
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn().mockResolvedValue(undefined),
}));
