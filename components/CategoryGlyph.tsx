import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import type { CategoryId } from '@/lib/categories';

// Path constants — verbatim from yana-website/categories.html
const HP    = 'M0 3.6 C -2.6 1 -3.6 -0.6 -2.1 -2 C -1.1 -2.9 0 -1.8 0 -0.7 C 0 -1.8 1.1 -2.9 2.1 -2 C 3.6 -0.6 2.6 1 0 3.6 Z';
const DROP  = 'M0 -1.8 C1.3 -0.2 1.3 1.5 0 1.5 C-1.3 1.5 -1.3 -0.2 0 -1.8 Z';
const SHK   = 'M8.8 11.2 L8.8 9 A3.2 3.2 0 0 1 15.2 9 L15.2 11.2 L13.4 11.2 L13.4 9 A1.4 1.4 0 0 0 10.6 9 L10.6 11.2 Z';
const BRAIN = 'M6 9 C6 6.4 8.4 5 12 5 C15.6 5 18 6.4 18 9 C19.1 9.4 19.5 10.7 18.9 11.7 C19.5 12.7 19 14.3 17.8 14.7 C17.3 16.5 14.9 17.5 12 17.5 C9.1 17.5 6.7 16.5 6.2 14.7 C5 14.3 4.5 12.7 5.1 11.7 C4.5 10.7 4.9 9.4 6 9 Z';

interface P { c: string; d: string; l: string; k?: string; f?: string }

const PAL: Record<CategoryId, P> = {
  mental_health: { c: '#9C8BF6', d: '#6E5CD8', l: '#C9C0FA' },
  relationships: { c: '#F5996E', d: '#E0734A', l: '#FBC7AE' },
  grief:         { c: '#7FA0FF', d: '#5A7FE8', l: '#DCE6FF', f: '#2F3E66' },
  secrets:       { c: '#FBBF24', d: '#E0A000', l: '#FDE08A', k: '#7A5800' },
  work_identity: { c: '#4FC8D6', d: '#2EA3B0', l: '#A6E7EE' },
  body_health:   { c: '#9BC47E', d: '#6FA251', l: '#C7E0B2' },
  faith_meaning: { c: '#B795E8', d: '#9568D6', l: '#DBC9F4' },
};

// Module-level counter — ensures gradient IDs are unique per SVG instance
// (gradient IDs are global on Android in react-native-svg)
let _n = 0;

function Brain({ g, p }: { g: string; p: P }) {
  return (
    <>
      <Path d={BRAIN} fill={`url(#${g})`} />
      <Path
        d="M12 5 C11.3 7.6 12.5 9 11.8 11 C12.5 13 11.5 15.2 12 17.5"
        stroke={p.d} strokeWidth={1} fill="none" strokeLinecap="round" opacity={0.55}
      />
      <Path
        d="M6.7 9.5 q2.1 -.5 3.3 .8 M6.3 12.2 q2.3 -.3 3.6 1 M8.1 14.7 q1.9 .1 2.9 1.3"
        stroke={p.d} strokeWidth={0.85} fill="none" strokeLinecap="round" opacity={0.5}
      />
      <Path
        d="M17.3 9.5 q-2.1 -.5 -3.3 .8 M17.7 12.2 q-2.3 -.3 -3.6 1 M15.9 14.7 q-1.9 .1 -2.9 1.3"
        stroke={p.d} strokeWidth={0.85} fill="none" strokeLinecap="round" opacity={0.5}
      />
      <Ellipse cx={9.2} cy={8} rx={1.7} ry={1} fill="#fff" opacity={0.22} transform="rotate(-16 9.2 8)" />
    </>
  );
}

function Hearts({ g, p }: { g: string; p: P }) {
  return (
    <>
      <G transform="translate(9.4 11.2) scale(.92)">
        <Path d={HP} fill={p.d} />
      </G>
      <G transform="translate(13.4 12.6) scale(1.16)">
        <Path d={HP} fill={`url(#${g})`} />
      </G>
      <Ellipse cx={12.7} cy={10.9} rx={1} ry={0.6} fill="#fff" opacity={0.4} transform="rotate(-28 12.7 10.9)" />
    </>
  );
}

function SadFace({ g, p }: { g: string; p: P }) {
  return (
    <>
      <Circle cx={12} cy={12} r={7} fill={`url(#${g})`} />
      <Ellipse cx={9.6} cy={8.4} rx={2.4} ry={1.4} fill="#fff" opacity={0.16} transform="rotate(-18 9.6 8.4)" />
      <Ellipse cx={9.7} cy={11.9} rx={0.9} ry={1.05} fill={p.f!} />
      <Ellipse cx={14.3} cy={11.9} rx={0.9} ry={1.05} fill={p.f!} />
      <Circle cx={9.4} cy={11.6} r={0.28} fill="#fff" opacity={0.85} />
      <Circle cx={14} cy={11.6} r={0.28} fill="#fff" opacity={0.85} />
      <Path d="M10 15.5 Q12 14.5 14 15.5" stroke={p.f!} strokeWidth={1.3} fill="none" strokeLinecap="round" />
      <G transform="translate(9.5 13.7) scale(.75)">
        <Path d={DROP} fill={p.l} />
      </G>
    </>
  );
}

function Lock({ g, p }: { g: string; p: P }) {
  return (
    <>
      <Path d={SHK} fill={p.d} />
      <Rect x={6.6} y={10.8} width={10.8} height={7.8} rx={2.5} fill={`url(#${g})`} />
      <Ellipse cx={9.4} cy={12.7} rx={1.5} ry={0.95} fill="#fff" opacity={0.25} transform="rotate(-28 9.4 12.7)" />
      <Circle cx={12} cy={13.9} r={1.25} fill={p.k!} />
      <Path d="M11.1 14.3 L12.9 14.3 L13.3 16.7 L10.7 16.7 Z" fill={p.k!} />
    </>
  );
}

function Mirror({ g, p }: { g: string; p: P }) {
  return (
    <>
      <Rect x={10.9} y={13.4} width={2.2} height={5.6} rx={1.1} fill={p.d} />
      <Ellipse cx={12} cy={9.2} rx={4.9} ry={5.5} fill={`url(#${g})`} />
      <Path d="M9.2 6 A4 4 0 0 0 8.3 10" stroke="#fff" strokeWidth={1} fill="none" opacity={0.4} strokeLinecap="round" />
    </>
  );
}

function Sprout({ g, p }: { g: string; p: P }) {
  return (
    <>
      <Path d="M12 18.6 V10.6" stroke={p.d} strokeWidth={1.5} strokeLinecap="round" />
      <Path d="M12 13 C9.2 13 7.6 11 8.1 8.8 C10.6 8.8 12 10.8 12 13 Z" fill={`url(#${g})`} />
      <Path d="M12 14.6 C14.8 14.6 16.4 12.6 15.9 10.4 C13.4 10.4 12 12.4 12 14.6 Z" fill={`url(#${g})`} />
      <Ellipse cx={9.6} cy={10.4} rx={0.9} ry={1.4} fill="#fff" opacity={0.25} transform="rotate(30 9.6 10.4)" />
    </>
  );
}

function Sunrise({ g, p }: { g: string; p: P }) {
  return (
    <>
      <Path d="M6 15 A6 6 0 0 1 18 15 Z" fill={`url(#${g})`} />
      <Path d="M3 15 H21" stroke={p.d} strokeWidth={1.5} strokeLinecap="round" />
      <Path
        d="M12 4 V5.8 M6.6 6.6 L7.9 7.9 M17.4 6.6 L16.1 7.9"
        stroke={p.l} strokeWidth={1.2} strokeLinecap="round"
      />
      <Ellipse cx={10.2} cy={12} rx={1.4} ry={1} fill="#fff" opacity={0.25} />
    </>
  );
}

export function CategoryGlyph({ id, size = 50 }: { id: CategoryId; size?: number }) {
  const [uid] = useState(() => ++_n);
  const p   = PAL[id];
  const g   = `${id}-g-${uid}`;
  const bed = `${id}-bed-${uid}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <RadialGradient id={bed} cx="50%" cy="44%" r="55%">
          <Stop offset="0%" stopColor={p.c} stopOpacity={0.34} />
          <Stop offset="72%" stopColor={p.c} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={g} x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0%"   stopColor={p.l} />
          <Stop offset="55%"  stopColor={p.c} />
          <Stop offset="100%" stopColor={p.d} />
        </LinearGradient>
      </Defs>

      {/* Radial glow bed */}
      <Circle cx={12} cy={11.5} r={12} fill={`url(#${bed})`} />

      {id === 'mental_health' && <Brain    g={g} p={p} />}
      {id === 'relationships' && <Hearts   g={g} p={p} />}
      {id === 'grief'         && <SadFace  g={g} p={p} />}
      {id === 'secrets'       && <Lock     g={g} p={p} />}
      {id === 'work_identity' && <Mirror   g={g} p={p} />}
      {id === 'body_health'   && <Sprout   g={g} p={p} />}
      {id === 'faith_meaning' && <Sunrise  g={g} p={p} />}
    </Svg>
  );
}

export function CategoryBadge({ id, size = 50 }: { id: CategoryId; size?: number }) {
  const { c } = PAL[id];
  return (
    <View
      style={{
        width:           size,
        height:          size,
        borderRadius:    size / 2,
        backgroundColor: c + '14',
        borderWidth:     1,
        borderColor:     c + '40',
        alignItems:      'center',
        justifyContent:  'center',
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <CategoryGlyph id={id} size={Math.round(size * 0.68)} />
    </View>
  );
}
