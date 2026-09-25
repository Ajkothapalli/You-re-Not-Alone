/**
 * Persona avatars — redrawn, but the same person every time.
 *
 * The drawing changed; the ASSIGNMENT must not have. A persona is derived from
 * the CONFESSION id (never the author — CLAUDE.md #2/#3), and it is the only
 * identity a confession carries. If the hash shifted, every confession already
 * in the pool would silently change face: someone would come back to their own
 * writing and find a stranger attached to it, and readers who recognised a
 * card by its avatar would be looking at a different one.
 *
 * The table below was captured by RUNNING the old component before the swap,
 * not by reading the new one. That ordering is the whole value of it — a table
 * generated afterwards would agree with anything.
 */

// Forward props so shape data is observable; the global mock drops them.
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mock = (name: string) => {
    const C = ({ children, testID, ...rest }: any) =>
      React.createElement(View, { testID: testID ?? name, ...rest }, children);
    C.displayName = name;
    return C;
  };
  return {
    __esModule: true,
    default: mock('Svg'), Svg: mock('Svg'), G: mock('G'), Path: mock('Path'),
    Circle: mock('Circle'), Ellipse: mock('Ellipse'), Rect: mock('Rect'),
    Defs: mock('Defs'), ClipPath: mock('ClipPath'),
    LinearGradient: mock('LinearGradient'), Stop: mock('Stop'),
  };
});

import React from 'react';
import { render } from '@testing-library/react-native';
import {
  PERSONAS, getPersona, getPersonaById, randomPersona, PersonaBadge,
} from '@/components/Persona';

/** Captured from the OLD component, before the redraw. Do not regenerate. */
const FROZEN_ASSIGNMENT: ReadonlyArray<readonly [string, string]> = [
  ['seed-0-a0', 'ash'],
  ['seed-1-b7919', 'ash'],
  ['seed-2-c15838', 'cruz'],
  ['seed-3-d23757', 'cove'],
  ['seed-4-e31676', 'kai'],
  ['seed-5-f39595', 'cruz'],
  ['seed-6-g47514', 'joel'],
  ['seed-7-h55433', 'river'],
  ['seed-8-i63352', 'sage'],
  ['seed-9-j71271', 'max'],
  ['seed-10-k79190', 'cruz'],
  ['seed-11-l87109', 'river'],
  ['seed-12-m95028', 'sage'],
  ['seed-13-n102947', 'ezra'],
  ['seed-14-o110866', 'joel'],
  ['seed-15-p118785', 'sage'],
  ['seed-16-q126704', 'miles'],
  ['seed-17-r134623', 'ash'],
  ['seed-18-s142542', 'cruz'],
  ['seed-19-t150461', 'river'],
  ['seed-20-u158380', 'miles'],
  ['seed-21-v166299', 'joel'],
  ['seed-22-w174218', 'indigo'],
  ['seed-23-x182137', 'rowan'],
  ['seed-24-y190056', 'miles'],
  ['seed-25-z197975', 'rowan'],
  ['seed-26-a205894', 'ezra'],
  ['seed-27-b213813', 'max'],
  ['seed-28-c221732', 'indigo'],
  ['seed-29-d229651', 'miles'],
  ['seed-30-e237570', 'sage'],
  ['seed-31-f245489', 'cruz'],
  ['seed-32-g253408', 'joel'],
  ['seed-33-h261327', 'river'],
  ['seed-34-i269246', 'ezra'],
  ['seed-35-j277165', 'indigo'],
  ['seed-36-k285084', 'rowan'],
  ['seed-37-l293003', 'cove'],
  ['seed-38-m300922', 'kai'],
  ['seed-39-n308841', 'cruz'],
  ['seed-40-o316760', 'cruz'],
  ['seed-41-p324679', 'kai'],
  ['seed-42-q332598', 'max'],
  ['seed-43-r340517', 'ash'],
  ['seed-44-s348436', 'rowan'],
  ['seed-45-t356355', 'miles'],
  ['seed-46-u364274', 'ezra'],
  ['seed-47-v372193', 'joel'],
  ['seed-48-w380112', 'indigo'],
  ['seed-49-x388031', 'sage']
];

const FROZEN_IDS = ['kai', 'ezra', 'joel', 'river', 'sage', 'max', 'indigo', 'rowan', 'miles', 'ash', 'cruz', 'cove'];

describe('persona assignment is frozen', () => {
  it.each(FROZEN_ASSIGNMENT)('getPersona(%s) is still %s', (seed, expected) => {
    expect(getPersona(seed).id).toBe(expected);
  });

  it('keeps the same twelve personas, in the same order', () => {
    // Order matters: getPersona indexes into PERSONAS by hash modulo length,
    // so reordering the array reassigns every confession just as surely as
    // changing the hash would.
    expect(PERSONAS.map((p) => p.id)).toEqual(FROZEN_IDS);
  });

  it('falls back to the first persona for an unknown id', () => {
    expect(getPersonaById('does-not-exist')).toBe(PERSONAS[0]);
    expect(getPersonaById('').id).toBe(FROZEN_IDS[0]);
  });

  it('is deterministic — the same seed always gives the same face', () => {
    for (const [seed] of FROZEN_ASSIGNMENT.slice(0, 10)) {
      const a = getPersona(seed).id;
      for (let i = 0; i < 5; i++) expect(getPersona(seed).id).toBe(a);
    }
  });

  it('randomPersona returns a real persona', () => {
    for (let i = 0; i < 30; i++) {
      expect(PERSONAS).toContain(randomPersona());
    }
  });
});

// ─── Rendering ───────────────────────────────────────────────────────────────

describe('PersonaBadge renders at every size it is used at', () => {
  // 64 profile, 44 picker, 36 button, 27 card, 22 onboarding.
  const SIZES = [22, 27, 36, 44, 64];

  it.each(PERSONAS.map((p) => [p.id, p] as const))(
    '%s renders at all five sizes',
    async (_id, persona) => {
      for (const size of SIZES) {
        const { toJSON } = await render(
          <PersonaBadge persona={persona} size={size} />,
        );
        expect(toJSON()).not.toBeNull();
      }
    },
  );

  it('honours showName', async () => {
    const { queryByText, rerender } = await render(
      <PersonaBadge persona={PERSONAS[0]} showName />,
    );
    expect(queryByText(PERSONAS[0].name)).toBeTruthy();
    await rerender(<PersonaBadge persona={PERSONAS[0]} showName={false} />);
    expect(queryByText(PERSONAS[0].name)).toBeNull();
  });

  it('draws a different face for each persona', async () => {
    // Hair is the identity in this illustration voice. Two personas resolving
    // to the same drawing would still render and look plausible.
    const shapes = new Set<string>();
    for (const p of PERSONAS) {
      const { toJSON } = await render(<PersonaBadge persona={p} size={64} />);
      const out: string[] = [];
      const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (typeof n.props?.d === 'string') out.push(n.props.d);
        walk(n.children);
      };
      walk(toJSON());
      shapes.add(out.join('|'));
    }
    expect(shapes.size).toBe(PERSONAS.length);
  });
});

// ─── The avatar-specific drawing rules ───────────────────────────────────────

describe('avatars drop the misprint treatment', () => {
  const src = require('fs').readFileSync(
    require('path').join(__dirname, '..', '..', 'components', 'Persona.tsx'), 'utf8',
  );
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('uses no off-register fill offsets', () => {
    // At 22-64px an off-register fill reads as a smudge on a face, not as a
    // riso misprint. Scenes keep it; avatars must not.
    expect(code).not.toMatch(/OFF2?3?\b/);
  });

  it('uses no pressure pass', () => {
    expect(code).not.toMatch(/STROKE\.press|PRESS_TRANSLATE/);
  });
});
