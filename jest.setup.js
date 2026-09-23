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
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);

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

// expo-router
jest.mock('expo-router', () => ({
  router:               { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useRouter:            jest.fn(() => ({ replace: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
  usePathname:          jest.fn(() => '/'),
  useSegments:          jest.fn(() => []),
  Link:                 ({ children }) => children,
  Stack:                { Screen: () => null },
}));

// react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
  SafeAreaProvider:  ({ children }) => children,
  SafeAreaView:      ({ children }) => children,
}));

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

// expo-font
jest.mock('expo-font', () => ({
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn().mockResolvedValue(undefined),
}));
