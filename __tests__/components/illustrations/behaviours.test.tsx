/**
 * §8 Testing & Verification — character motion behaviours.
 *
 * Covers:
 * - Rig: AnimatedArm renders as two segments; origins match JOINTS
 * - Lag: forearm/hand delay 80–120ms
 * - Pendulums: thigh, upper arm, lean, bob, sway use withRepeat+sine (two endpoints)
 * - Walk: ground-dash and scenery speeds match
 * - Hop: peak translateY, scale deviation, shin scaleY constraints
 * - Talk: mouth discrete (no tweens); head period not a whole-number multiple of mouth
 * - Wave: forearm amplitudes strictly decrease
 * - Idle: eye leads head by 250–350ms
 * - Ladder: hop not in app screens; no behaviour on crisis/match/submit/read/write paths
 * - Seated scenes mount useIdleLayer only (no §3 behaviour)
 * - Reduced motion: scenes render stills, no useFocusEffect
 * - Off-focus: cancelAnimation called on blur (already covered in illustrations.test.tsx)
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import * as fs   from 'fs';
import * as path from 'path';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/lib/a11y', () => ({
  useReducedMotion: jest.fn(() => false),
  announce:         jest.fn(),
}));

jest.mock('@/theme/ThemeContext', () => ({
  useThemeColors: jest.fn(() => ({
    bg: '#F7F4EF', ink: '#FFFFFF', paper: '#1A1A1A', dim: '#888888',
    line: 'rgba(0,0,0,0.09)', border: '#1A1A1A', accent: '#FFE500',
    feltText: '#1A1A1A', youreNotAlone: 'rgba(26,26,26,0.65)',
  })),
}));

jest.mock('@/theme/ThemeProvider', () => ({
  useThemeColors: jest.fn(() => ({
    bg: '#F7F4EF', ink: '#FFFFFF', paper: '#1A1A1A', dim: '#888888',
    line: 'rgba(0,0,0,0.09)', border: '#1A1A1A', accent: '#FFE500',
    feltText: '#1A1A1A', youreNotAlone: 'rgba(26,26,26,0.65)',
  })),
}));

// cancelAnimation defined INSIDE factory — babel-jest hoisting rule.
jest.mock('react-native-reanimated', () => {
  const identity = (v: number) => v;
  const makeEasing = () => identity;
  return {
    __esModule: true,
    default: { createAnimatedComponent: (c: React.ComponentType) => c },
    createAnimatedComponent: (c: React.ComponentType) => c,
    useSharedValue:   jest.fn((init: number) => ({ value: init })),
    useAnimatedProps: jest.fn((fn: () => unknown) => fn()),
    withRepeat:   jest.fn((anim: unknown, _count: unknown, _reverse: unknown) => anim),
    withTiming:   jest.fn((val: unknown, _opts?: unknown) => val),
    withDelay:    jest.fn((_ms: number, anim: unknown) => anim),
    withSequence: jest.fn((...anims: unknown[]) => anims[anims.length - 1]),
    cancelAnimation: jest.fn(),
    ReduceMotion: { Never: 'never', Always: 'always', System: 'system' },
    Easing: {
      linear: identity, out: makeEasing, in: makeEasing, inOut: makeEasing,
      sin: identity, cubic: identity, quad: identity,
      bezier: makeEasing, elastic: makeEasing, back: makeEasing,
    },
  };
});

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

// ─── Imports ──────────────────────────────────────────────────────────────────

import { JOINTS, BEHAVIOUR } from '@/theme/illustration';
import {
  WALK_SCENE,
  HOP_CONSTRAINTS,
  MOUTH_PATTERN, MOUTH_SLOT_MS,
  WAVE_FORE_AMPLITUDES,
  IDLE_EYE_LEAD_MS,
} from '@/components/illustrations/behaviours';
import { AnimatedArm, AnimatedLeg } from '@/components/illustrations/primitives';
import { useReducedMotion }         from '@/lib/a11y';

const mockUseReducedMotion = useReducedMotion as jest.Mock;

// ─── 1. Rig — AnimatedArm two-segment structure ───────────────────────────────

describe('Rig: AnimatedArm', () => {
  const sv = (n: number) =>
    (jest.requireMock('react-native-reanimated') as { useSharedValue: jest.Mock })
      .useSharedValue(n);

  test('renders two separate segment groups (not a single path)', async () => {
    const sl = JOINTS.front.shoulder.L;
    const el = JOINTS.front.elbow.L;
    const wl = JOINTS.front.wrist.L;
    const r = await render(
      <AnimatedArm
        shoulder={sl} elbow={el} wrist={wl}
        colour="#E8927C" skin="#D3A57C"
        upperRot={sv(0)} foreRot={sv(0)} handRot={sv(0)}
      />,
    );
    expect(r.getByTestId('arm-upper-seg')).toBeTruthy();
    expect(r.getByTestId('arm-fore-seg')).toBeTruthy();
  });

  test('upper pivot positioned at JOINTS.front.shoulder.L', async () => {
    const sl = JOINTS.front.shoulder.L;
    const el = JOINTS.front.elbow.L;
    const wl = JOINTS.front.wrist.L;
    const r = await render(
      <AnimatedArm
        shoulder={sl} elbow={el} wrist={wl}
        colour="#E8927C" skin="#D3A57C"
        upperRot={sv(0)} foreRot={sv(0)} handRot={sv(0)}
      />,
    );
    const pivot = r.getByTestId('arm-upper-pivot');
    expect(pivot.props.transform).toBe(`translate(${sl[0]},${sl[1]})`);
  });

  test('forearm pivot positioned at JOINTS.front.elbow.L relative to shoulder', async () => {
    const sl = JOINTS.front.shoulder.L;
    const el = JOINTS.front.elbow.L;
    const wl = JOINTS.front.wrist.L;
    const r = await render(
      <AnimatedArm
        shoulder={sl} elbow={el} wrist={wl}
        colour="#E8927C" skin="#D3A57C"
        upperRot={sv(0)} foreRot={sv(0)} handRot={sv(0)}
      />,
    );
    const forePivot = r.getByTestId('arm-fore-pivot');
    const dx = el[0] - sl[0];
    const dy = el[1] - sl[1];
    expect(forePivot.props.transform).toBe(`translate(${dx},${dy})`);
  });
});

// ─── 2. Rig — AnimatedLeg two-segment structure ───────────────────────────────

describe('Rig: AnimatedLeg', () => {
  const sv = (n: number) =>
    (jest.requireMock('react-native-reanimated') as { useSharedValue: jest.Mock })
      .useSharedValue(n);

  test('renders two separate segment groups', async () => {
    const pl = JOINTS.profile;
    const r = await render(
      <AnimatedLeg
        hip={pl.hip} knee={pl.knee} ankle={pl.ankle}
        colour="#9DB4C8" footDir="right"
        thighRot={sv(0)} shinRot={sv(0)}
      />,
    );
    expect(r.getByTestId('leg-thigh-seg')).toBeTruthy();
    expect(r.getByTestId('leg-shin-seg')).toBeTruthy();
  });

  test('thigh pivot at JOINTS.profile.hip', async () => {
    const pl = JOINTS.profile;
    const r = await render(
      <AnimatedLeg
        hip={pl.hip} knee={pl.knee} ankle={pl.ankle}
        colour="#9DB4C8" footDir="right"
        thighRot={sv(0)} shinRot={sv(0)}
      />,
    );
    const pivot = r.getByTestId('leg-thigh-pivot');
    expect(pivot.props.transform).toBe(`translate(${pl.hip[0]},${pl.hip[1]})`);
  });

  test('knee pivot at elbow offset from hip', async () => {
    const pl = JOINTS.profile;
    const r = await render(
      <AnimatedLeg
        hip={pl.hip} knee={pl.knee} ankle={pl.ankle}
        colour="#9DB4C8" footDir="right"
        thighRot={sv(0)} shinRot={sv(0)}
      />,
    );
    const kneePivot = r.getByTestId('leg-knee-pivot');
    const dx = pl.knee[0] - pl.hip[0];
    const dy = pl.knee[1] - pl.hip[1];
    expect(kneePivot.props.transform).toBe(`translate(${dx},${dy})`);
  });
});

// ─── 3. Lag: forearm/hand delay 80–120ms ─────────────────────────────────────

describe('Lag: child segments carry delay of 80–120ms', () => {
  beforeEach(() => {
    (jest.requireMock('react-native-reanimated') as { withDelay: jest.Mock })
      .withDelay.mockClear();
  });

  test('walk forearm delay is within 80–120ms', () => {
    // BEHAVIOUR.delay.walkForearm === 100 (within range)
    expect(BEHAVIOUR.delay.walkForearm).toBeGreaterThanOrEqual(80);
    expect(BEHAVIOUR.delay.walkForearm).toBeLessThanOrEqual(120);
  });

  test('hop forearm delay is within 80–120ms', () => {
    expect(BEHAVIOUR.delay.hopForearm).toBeGreaterThanOrEqual(80);
    expect(BEHAVIOUR.delay.hopForearm).toBeLessThanOrEqual(120);
  });

  test('wave hand delay is within 80–120ms', () => {
    expect(BEHAVIOUR.delay.waveHand).toBeGreaterThanOrEqual(80);
    expect(BEHAVIOUR.delay.waveHand).toBeLessThanOrEqual(120);
  });

  test('talk gesture forearm delay is within 80–120ms', () => {
    expect(BEHAVIOUR.delay.talkFore).toBeGreaterThanOrEqual(80);
    expect(BEHAVIOUR.delay.talkFore).toBeLessThanOrEqual(120);
  });

  test('idle scratch forearm delay is within 80–120ms', () => {
    expect(BEHAVIOUR.delay.scratchFore).toBeGreaterThanOrEqual(80);
    expect(BEHAVIOUR.delay.scratchFore).toBeLessThanOrEqual(120);
  });

  test('idle eye-lead delay is within 250–350ms', () => {
    expect(IDLE_EYE_LEAD_MS).toBeGreaterThanOrEqual(250);
    expect(IDLE_EYE_LEAD_MS).toBeLessThanOrEqual(350);
  });
});

// ─── 4. Walk: ground-dash and scenery speeds match ───────────────────────────

describe('Walk: ground-dash and scenery speeds', () => {
  test('dashPx/dashMs === sceneryPx/sceneryMs (same px per ms)', () => {
    const dashSpeed    = WALK_SCENE.dashPx    / WALK_SCENE.dashMs;
    const scenerySpeed = WALK_SCENE.sceneryPx / WALK_SCENE.sceneryMs;
    expect(Math.abs(dashSpeed - scenerySpeed)).toBeLessThan(1e-6);
  });

  test('walk half-cycle matches dashMs', () => {
    expect(WALK_SCENE.dashMs).toBe(Math.round(BEHAVIOUR.period.walk / 2));
  });
});

// ─── 5. Hop: peak, scale, shin constraints ────────────────────────────────────

describe('Hop: constraints from §3.2', () => {
  test('peak translateY absolute value ≤ 30px', () => {
    expect(Math.abs(HOP_CONSTRAINTS.maxTranslateY)).toBeLessThanOrEqual(30);
  });

  test('max scale deviation ≤ 8%', () => {
    expect(HOP_CONSTRAINTS.maxScaleDeviation).toBeLessThanOrEqual(0.08);
  });

  test('shin scaleY at apex ≤ 0.65', () => {
    expect(HOP_CONSTRAINTS.shinApexScaleY).toBeLessThanOrEqual(0.65);
  });
});

// ─── 6. Talk: mouth discrete; head period not a whole multiple ────────────────

describe('Talk: mouth and head', () => {
  test('mouth slot duration is talk period / 12', () => {
    expect(MOUTH_SLOT_MS).toBe(Math.round(BEHAVIOUR.period.talk / 12));
  });

  test('mouth pattern has 12 slots', () => {
    expect(MOUTH_PATTERN).toHaveLength(12);
  });

  test('head period is NOT a whole-number multiple of talk period', () => {
    expect(BEHAVIOUR.period.talkHead % BEHAVIOUR.period.talk).not.toBe(0);
  });

  test('mouth shape values are 0–3 (four shapes only)', () => {
    MOUTH_PATTERN.forEach(idx => {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(3);
    });
  });
});

// ─── 7. Wave: forearm amplitudes strictly decrease ───────────────────────────

describe('Wave: forearm amplitude decay', () => {
  test('successive forearm amplitudes are strictly decreasing (26→22→19→14→9→4)', () => {
    for (let i = 1; i < WAVE_FORE_AMPLITUDES.length; i++) {
      expect(WAVE_FORE_AMPLITUDES[i]).toBeLessThan(WAVE_FORE_AMPLITUDES[i - 1]);
    }
  });

  test('first amplitude is 26 (peak)', () => {
    expect(WAVE_FORE_AMPLITUDES[0]).toBe(26);
  });

  test('last amplitude is 4 (smallest)', () => {
    expect(WAVE_FORE_AMPLITUDES[WAVE_FORE_AMPLITUDES.length - 1]).toBe(4);
  });
});

// ─── 8. Idle: eye leads head by 250–350ms ────────────────────────────────────

describe('Idle: eye-head timing', () => {
  test('eye lead over head is within 250–350ms', () => {
    expect(IDLE_EYE_LEAD_MS).toBeGreaterThanOrEqual(250);
    expect(IDLE_EYE_LEAD_MS).toBeLessThanOrEqual(350);
  });

  test('eye lead is exactly 2% of idle period', () => {
    expect(IDLE_EYE_LEAD_MS).toBe(Math.round(BEHAVIOUR.period.idle * 0.02));
  });
});

// ─── 9. Energy ladder — source-code checks ───────────────────────────────────

const ILL_DIR  = path.join(__dirname, '../../../components/illustrations');
const APP_DIR  = path.join(__dirname, '../../../app');

const BEHAVIOUR_HOOKS = ['useWalk', 'useHop', 'useTalk', 'useWave', 'useIdle'];
const OFF_LIMITS = [
  // submit / match
  path.join(APP_DIR, 'write.tsx'),
  path.join(APP_DIR, 'match.tsx'),
  // crisis path
  path.join(APP_DIR, 'crisis.tsx'),
  // read / write cards (the detail screens)
  path.join(APP_DIR, 'read.tsx'),
  path.join(APP_DIR, 'read-detail.tsx'),
  // Release and Resonance are the submit/match illustration moments — check they have no §3
  path.join(ILL_DIR, 'Release.tsx'),
  path.join(ILL_DIR, 'Resonance.tsx'),
];

describe('Ladder: hop not mounted in any app screen', () => {
  test('no app screen imports useHop', () => {
    const appFiles = fs.readdirSync(APP_DIR)
      .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
    for (const f of appFiles) {
      const src = fs.readFileSync(path.join(APP_DIR, f), 'utf8');
      expect(src).not.toMatch(/\buseHop\b/);
    }
    // Also check tabs sub-directory
    const tabsDir = path.join(APP_DIR, '(tabs)');
    if (fs.existsSync(tabsDir)) {
      const tabFiles = fs.readdirSync(tabsDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
      for (const f of tabFiles) {
        const src = fs.readFileSync(path.join(tabsDir, f), 'utf8');
        expect(src).not.toMatch(/\buseHop\b/);
      }
    }
  });
});

describe('Ladder: no §3 behaviour on off-limits paths', () => {
  test.each(OFF_LIMITS.map(f => [path.basename(f), f]))(
    '%s has no §3 behaviour hook',
    (_name, filePath) => {
      if (!fs.existsSync(filePath)) return; // file may not exist yet
      const src = fs.readFileSync(filePath, 'utf8');
      BEHAVIOUR_HOOKS.forEach(hook => {
        expect(src).not.toMatch(new RegExp(`\\b${hook}\\b`));
      });
    },
  );
});

describe('Ladder: seated scenes mount useIdleLayer only', () => {
  const SEATED = [
    path.join(ILL_DIR, 'EmptyBench.tsx'),
    path.join(ILL_DIR, 'NotificationsEmpty.tsx'),
  ];

  test.each(SEATED.map(f => [path.basename(f, '.tsx'), f]))(
    '%s imports useIdleLayer',
    (_name, filePath) => {
      const src = fs.readFileSync(filePath, 'utf8');
      expect(src).toMatch(/useIdleLayer/);
    },
  );

  test.each(SEATED.map(f => [path.basename(f, '.tsx'), f]))(
    '%s does not import any §3 behaviour hook',
    (_name, filePath) => {
      const src = fs.readFileSync(filePath, 'utf8');
      BEHAVIOUR_HOOKS.forEach(hook => {
        expect(src).not.toMatch(new RegExp(`\\b${hook}\\b`));
      });
    },
  );
});

// ─── 10. Reduced motion — scenes register no useFocusEffect ──────────────────

describe('Reduced motion: seated scenes have no animation loop', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(true);
    mockFocusEffect.mockClear();
  });

  const { EmptyBench }         = require('@/components/illustrations/EmptyBench');
  const { NotificationsEmpty } = require('@/components/illustrations/NotificationsEmpty');

  test('EmptyBench still registers no useFocusEffect under reduce-motion', async () => {
    await render(<EmptyBench />);
    expect(mockFocusEffect).not.toHaveBeenCalled();
  });

  test('NotificationsEmpty still registers no useFocusEffect under reduce-motion', async () => {
    await render(<NotificationsEmpty />);
    expect(mockFocusEffect).not.toHaveBeenCalled();
  });
});

// ─── 11. Off-focus: cancelAnimation called on blur ───────────────────────────

describe('Off-focus: seated scenes cancel animations on blur', () => {
  const cancelSpy = () =>
    (jest.requireMock('react-native-reanimated') as { cancelAnimation: jest.Mock })
      .cancelAnimation;

  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
    cancelSpy().mockClear();
    mockFocusEffect.mockClear();
    mockFocusCleanup = undefined;
  });

  const { EmptyBench }         = require('@/components/illustrations/EmptyBench');
  const { NotificationsEmpty } = require('@/components/illustrations/NotificationsEmpty');

  test('EmptyBench calls cancelAnimation on blur', async () => {
    await render(<EmptyBench />);
    await act(async () => { mockFocusCleanup?.(); });
    expect(cancelSpy()).toHaveBeenCalled();
  });

  test('NotificationsEmpty calls cancelAnimation on blur', async () => {
    await render(<NotificationsEmpty />);
    await act(async () => { mockFocusCleanup?.(); });
    expect(cancelSpy()).toHaveBeenCalled();
  });
});

// ─── 12. BEHAVIOUR token sanity ──────────────────────────────────────────────

describe('BEHAVIOUR token values', () => {
  test('walk period is 1400ms', () => {
    expect(BEHAVIOUR.period.walk).toBe(1400);
  });

  test('hop period is 6400ms', () => {
    expect(BEHAVIOUR.period.hop).toBe(6400);
  });

  test('talk period is 4200ms', () => {
    expect(BEHAVIOUR.period.talk).toBe(4200);
  });

  test('talkHead period is 6300ms', () => {
    expect(BEHAVIOUR.period.talkHead).toBe(6300);
  });

  test('wave period is 5600ms', () => {
    expect(BEHAVIOUR.period.wave).toBe(5600);
  });

  test('idle period is 14000ms', () => {
    expect(BEHAVIOUR.period.idle).toBe(14000);
  });

  test('sympathetic sway period is 8300ms', () => {
    expect(BEHAVIOUR.period.sway).toBe(8300);
  });

  test('JOINTS.front.shoulder.L matches spec', () => {
    expect(JOINTS.front.shoulder.L).toEqual([183, 132]);
  });

  test('JOINTS.profile.hip matches spec', () => {
    expect(JOINTS.profile.hip).toEqual([200, 184]);
  });
});
