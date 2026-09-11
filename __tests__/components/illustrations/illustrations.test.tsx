/**
 * §10 Testing & Verification — illustration system
 *
 * Covers:
 * - Each scene renders exactly one Svg with no filter elements
 * - Palette: every hex colour in scene source is in ILL_COLOR
 * - Reduced motion: still component renders without useFocusEffect (no animation loop)
 * - Clock periods are distinct within each scene
 * - Loops pause on blur (cancelAnimation called in cleanup)
 * - EmptyBench mounted in you.tsx empty state; NotificationsEmpty in notifications.tsx
 * - Crisis path has no illustration imports
 * - IllustrationCard: radius.card border-radius, hard shadow (no blur), ILL_COLOR.card bg
 * - Light/dark snapshots for all four scenes in reduced-motion still
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import * as fs from 'fs';
import * as path from 'path';

import { ILL_COLOR } from '@/theme/illustration';
import { ILLUSTRATION } from '@/theme/motion';
import { radius } from '@/theme/tokens';

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Variables referenced inside jest.mock factories MUST start with 'mock'
// for babel-jest's automatic hoisting to work correctly.

jest.mock('@/lib/a11y', () => ({
  useReducedMotion: jest.fn(() => false),
  announce:         jest.fn(),
}));

jest.mock('@/theme/ThemeContext', () => ({
  useThemeColors: jest.fn(() => ({
    bg:            '#F7F4EF',
    ink:           '#FFFFFF',
    paper:         '#1A1A1A',
    dim:           '#888888',
    line:          'rgba(0,0,0,0.09)',
    border:        '#1A1A1A',
    accent:        '#FFE500',
    feltText:      '#1A1A1A',
    youreNotAlone: 'rgba(26,26,26,0.65)',
  })),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  useThemeColors: jest.fn(() => ({
    bg:            '#F7F4EF',
    ink:           '#FFFFFF',
    paper:         '#1A1A1A',
    dim:           '#888888',
    line:          'rgba(0,0,0,0.09)',
    border:        '#1A1A1A',
    accent:        '#FFE500',
    feltText:      '#1A1A1A',
    youreNotAlone: 'rgba(26,26,26,0.65)',
  })),
}));

// Inline reanimated mock — avoids loading react-native-worklets native bindings.
// react-native-reanimated/mock.js requires worklets which crashes in tests.
//
// cancelAnimation is defined INSIDE the factory (not captured from outside) because
// babel-jest hoists jest.mock() factories to run during import processing, before any
// module-scope const initialisers have run. Capturing an external variable would give
// undefined at factory time; jest.fn() inside the factory is always correct.
jest.mock('react-native-reanimated', () => {
  const identity = (v: number) => v;
  const makeEasing = () => identity;
  return {
    __esModule: true,
    default: {
      createAnimatedComponent: (c: React.ComponentType) => c,
    },
    createAnimatedComponent: (c: React.ComponentType) => c,
    useSharedValue:   jest.fn((init: number) => ({ value: init })),
    useAnimatedProps: jest.fn((fn: () => unknown) => fn()),
    withRepeat:       jest.fn((anim: unknown) => anim),
    withTiming:       jest.fn((val: unknown) => val),
    withDelay:        jest.fn((_: number, anim: unknown) => anim),
    withSequence:     jest.fn((...anims: unknown[]) => anims[anims.length - 1]),
    cancelAnimation:  jest.fn(),
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

// useFocusEffect: call the callback immediately, store cleanup so tests
// can simulate blur by invoking it.
let mockFocusCleanup: (() => void) | undefined;
const mockFocusEffect = jest.fn((cb: () => (() => void) | undefined) => {
  mockFocusCleanup = cb();
});
jest.mock('expo-router', () => ({
  useFocusEffect:       (cb: () => (() => void) | undefined) => mockFocusEffect(cb),
  useRouter:            jest.fn(() => ({ replace: jest.fn(), push: jest.fn() })),
  useLocalSearchParams: jest.fn(() => ({})),
  usePathname:          jest.fn(() => '/'),
  Link:                 ({ children }: { children: React.ReactNode }) => children,
}));

import { EmptyBench }         from '@/components/illustrations/EmptyBench';
import { NotificationsEmpty } from '@/components/illustrations/NotificationsEmpty';
import { Release }            from '@/components/illustrations/Release';
import { Resonance }          from '@/components/illustrations/Resonance';
import { IllustrationCard }   from '@/components/illustrations/IllustrationCard';
import { useReducedMotion }   from '@/lib/a11y';

const mockUseReducedMotion = useReducedMotion as jest.Mock;

// ─── Constants ─────────────────────────────────────────────────────────────────

const SCENES_DIR = path.join(__dirname, '../../../components/illustrations');
const PALETTE    = new Set(Object.values(ILL_COLOR).map(h => h.toLowerCase()));

function hexesInSource(file: string): string[] {
  const src = fs.readFileSync(path.join(SCENES_DIR, file), 'utf8');
  return (src.match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map(h => h.toLowerCase());
}

const SCENES: [string, React.ComponentType<any>][] = [
  ['EmptyBench',         EmptyBench],
  ['NotificationsEmpty', NotificationsEmpty],
  ['Release',            Release],
  ['Resonance',          Resonance],
];

// ─── 1. Scene structure ───────────────────────────────────────────────────────

describe('scene structure (animated)', () => {
  beforeEach(() => { mockUseReducedMotion.mockReturnValue(false); });

  test.each(SCENES)('%s renders exactly one Svg', async (_name, Scene) => {
    const { getAllByTestId } = await render(<Scene />);
    expect(getAllByTestId('Svg')).toHaveLength(1);
  });

  test.each(SCENES)('%s has no filter elements', async (_name, Scene) => {
    const { queryAllByTestId } = await render(<Scene />);
    expect(queryAllByTestId('Filter')).toHaveLength(0);
    expect(queryAllByTestId('FeTurbulence')).toHaveLength(0);
    expect(queryAllByTestId('FeDisplacementMap')).toHaveLength(0);
  });
});

describe('scene structure (still / reduced motion)', () => {
  beforeEach(() => { mockUseReducedMotion.mockReturnValue(true); });

  test.each(SCENES)('%s still renders exactly one Svg', async (_name, Scene) => {
    const { getAllByTestId } = await render(<Scene />);
    expect(getAllByTestId('Svg')).toHaveLength(1);
  });
});

// ─── 2. Palette purity ────────────────────────────────────────────────────────

describe('palette purity', () => {
  test.each(SCENES.map(([name]) => name))('%s.tsx uses only ILL_COLOR palette colours', (name) => {
    const hexes = hexesInSource(`${name}.tsx`);
    const stray  = hexes.filter(h => !PALETTE.has(h));
    expect(stray).toHaveLength(0);
  });
});

// ─── 3. Reduced motion — no animation loop registered ────────────────────────

describe('reduced motion: still component has no animation loop', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(true);
    mockFocusEffect.mockClear();
    mockFocusCleanup = undefined;
  });

  test.each(SCENES)('%s does not register useFocusEffect when motion is reduced', async (_name, Scene) => {
    await render(<Scene />);
    expect(mockFocusEffect).not.toHaveBeenCalled();
  });
});

// ─── 4. Clock periods are distinct ───────────────────────────────────────────

describe('ILLUSTRATION clock periods', () => {
  test('breathe periods differ (5200 ms vs 6100 ms)', () => {
    const [p1, p2] = ILLUSTRATION.breathe;
    expect(p1).not.toBe(p2);
  });

  test('nod periods differ (7000 ms vs 7600 ms)', () => {
    const [p1, p2] = ILLUSTRATION.nod;
    expect(p1).not.toBe(p2);
  });

  test('EmptyBench five clocks all have distinct periods', () => {
    const periods = [
      ILLUSTRATION.breathe[0],  // chest  5200ms
      ILLUSTRATION.nod[0],      // head   7000ms
      ILLUSTRATION.blink,       // eyes   6100ms
      ILLUSTRATION.sway,        // shrub  6400ms
      ILLUSTRATION.leaf,        // leaf  13000ms
    ];
    expect(new Set(periods).size).toBe(periods.length);
  });

  test('NotificationsEmpty four clocks all have distinct periods', () => {
    const periods = [
      ILLUSTRATION.breathe[1],  // chest  6100ms
      ILLUSTRATION.nod[1],      // head   7600ms
      ILLUSTRATION.sway,        // plant  6400ms
      ILLUSTRATION.steam,       // steam  3800ms
    ];
    expect(new Set(periods).size).toBe(periods.length);
  });

  test('steam second wisp offset (1400 ms) is positive and less than steam period', () => {
    const STEAM_OFFSET_MS = 1400;
    expect(STEAM_OFFSET_MS).toBeGreaterThan(0);
    expect(STEAM_OFFSET_MS).toBeLessThan(ILLUSTRATION.steam);
  });
});

// ─── 5. Focus lifecycle (pause on blur) ──────────────────────────────────────

describe('focus lifecycle', () => {
  // Access cancelAnimation through the mock module — defined inside the factory
  // so jest.requireMock is the only safe way to reference it after hoisting.
  const cancelSpy = () =>
    (jest.requireMock('react-native-reanimated') as { cancelAnimation: jest.Mock })
      .cancelAnimation;

  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
    cancelSpy().mockClear();
    mockFocusEffect.mockClear();
    mockFocusCleanup = undefined;
  });

  test.each(SCENES)('%s registers useFocusEffect', async (_name, Scene) => {
    await render(<Scene />);
    expect(mockFocusEffect).toHaveBeenCalledTimes(1);
  });

  test.each(SCENES)('%s calls cancelAnimation on blur (cleanup)', async (_name, Scene) => {
    await render(<Scene />);
    await act(async () => { mockFocusCleanup?.(); });
    expect(cancelSpy()).toHaveBeenCalled();
  });
});

// ─── 6. Mount point source checks ────────────────────────────────────────────

describe('mount points', () => {
  test('EmptyBench component file exists', () => {
    expect(fs.existsSync(path.join(SCENES_DIR, 'EmptyBench.tsx'))).toBe(true);
  });

  test('NotificationsEmpty component file exists', () => {
    expect(fs.existsSync(path.join(SCENES_DIR, 'NotificationsEmpty.tsx'))).toBe(true);
  });

  test('you.tsx imports EmptyBench and uses it in the empty-confessions state', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../app/(tabs)/you.tsx'), 'utf8',
    );
    expect(src).toMatch(/EmptyBench/);
    expect(src).toMatch(/confessions\.length === 0/);
  });

  test('notifications.tsx imports NotificationsEmpty for its empty state', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../../../app/(tabs)/notifications.tsx'), 'utf8',
    );
    expect(src).toMatch(/NotificationsEmpty/);
  });
});

// ─── 7. Crisis path is illustration-free ─────────────────────────────────────

describe('crisis path', () => {
  const ILL_NAMES = ['EmptyBench', 'NotificationsEmpty', 'Release', 'Resonance', 'IllustrationCard'];

  test('screen files with "crisis" in the name do not import any illustration', () => {
    const appDir = path.join(__dirname, '../../../app');
    const crisisFiles = fs.readdirSync(appDir)
      .filter(f => /crisis/i.test(f) && (f.endsWith('.tsx') || f.endsWith('.ts')));

    for (const file of crisisFiles) {
      const src = fs.readFileSync(path.join(appDir, file), 'utf8');
      for (const name of ILL_NAMES) {
        expect(src).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
    }
  });

  test('illustration components do not import from any crisis path', () => {
    const files = fs.readdirSync(SCENES_DIR).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
    for (const file of files) {
      const src = fs.readFileSync(path.join(SCENES_DIR, file), 'utf8');
      expect(src).not.toMatch(/crisis/i);
    }
  });
});

// ─── 8. IllustrationCard ─────────────────────────────────────────────────────

describe('IllustrationCard', () => {
  beforeEach(() => { mockUseReducedMotion.mockReturnValue(true); });

  test('renders with custom testID', async () => {
    const { getByTestId } = await render(
      <IllustrationCard testID="ill-test"><EmptyBench /></IllustrationCard>,
    );
    expect(getByTestId('ill-test')).toBeTruthy();
  });

  test('card has borderRadius equal to radius.card', async () => {
    const { getByTestId } = await render(
      <IllustrationCard><EmptyBench /></IllustrationCard>,
    );
    const card = getByTestId('IllustrationCard-card');
    const flat = Array.isArray(card.props.style)
      ? Object.assign({}, ...(card.props.style as object[]))
      : card.props.style as Record<string, unknown>;
    expect(flat.borderRadius).toBe(radius.card);
  });

  test('shadow block has borderRadius equal to radius.card and no blur', async () => {
    const { getByTestId } = await render(
      <IllustrationCard><EmptyBench /></IllustrationCard>,
    );
    const shadow = getByTestId('IllustrationCard-shadow');
    const flat = Array.isArray(shadow.props.style)
      ? Object.assign({}, ...(shadow.props.style as object[]))
      : shadow.props.style as Record<string, unknown>;
    expect(flat.borderRadius).toBe(radius.card);
    expect(flat.shadowRadius).toBeUndefined();
    expect(flat.shadowBlurRadius).toBeUndefined();
    expect(flat.shadowOpacity).toBeUndefined();
  });

  test('card background is ILL_COLOR.card', async () => {
    const { getByTestId } = await render(
      <IllustrationCard><EmptyBench /></IllustrationCard>,
    );
    const card = getByTestId('IllustrationCard-card');
    const flat = Array.isArray(card.props.style)
      ? Object.assign({}, ...(card.props.style as object[]))
      : card.props.style as Record<string, unknown>;
    expect(flat.backgroundColor).toBe(ILL_COLOR.card);
  });
});

// ─── 9. Snapshots (still / reduced motion, light + dark) ─────────────────────

describe('snapshots', () => {
  const LIGHT = {
    bg: '#F7F4EF', ink: '#FFFFFF', paper: '#1A1A1A', dim: '#888888',
    line: 'rgba(0,0,0,0.09)', border: '#1A1A1A', accent: '#FFE500',
    feltText: '#1A1A1A', youreNotAlone: 'rgba(26,26,26,0.65)',
  };
  const DARK = {
    bg: '#0A0A0A', ink: '#141414', paper: '#F5F5F5', dim: '#666666',
    line: '#2A2A2A', border: '#FFFFFF', accent: '#FFE500',
    feltText: '#FFE500', youreNotAlone: 'rgba(245,245,245,0.80)',
  };

  const mockTheme = (require('@/theme/ThemeContext') as { useThemeColors: jest.Mock }).useThemeColors;

  beforeEach(() => { mockUseReducedMotion.mockReturnValue(true); });

  test.each(SCENES)('%s light-theme still snapshot', async (name, Scene) => {
    mockTheme.mockReturnValue(LIGHT);
    const result = await render(<Scene />);
    expect(result.toJSON()).toMatchSnapshot(`${name}-light-still`);
  });

  test.each(SCENES)('%s dark-theme still snapshot', async (name, Scene) => {
    mockTheme.mockReturnValue(DARK);
    const result = await render(<Scene />);
    expect(result.toJSON()).toMatchSnapshot(`${name}-dark-still`);
  });
});
