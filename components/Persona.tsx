/**
 * Persona — flat-style human character busts (head to neck only).
 *
 * Two uses, deliberately separate:
 *  1. Confession cards: getPersona(confessionId) — derived from the
 *     CONFESSION id only, never the author. Two confessions by the same
 *     person render as different personas. (CLAUDE.md #2/#3 — personas
 *     must never link an author's confessions together.)
 *  2. The user's own profile: a character they pick for THEMSELVES
 *     (lib/profile.ts). Profile-only — never shown on confessions,
 *     never leaves the device.
 *
 * Construction: hair mass behind a smaller face circle (thick rim),
 * fringe over the forehead, white-oval eyes with highlighted pupils,
 * brows + blush on everyone, varied mouths for personality.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { font, fontFamily, radius } from '../theme/tokens';

export interface Persona {
  id:   string;
  name: string;
  // [tint, skin, hair] — tint drives the badge background + name colour
  colors: [string, string, string];
}

export const PERSONAS: Persona[] = [
  { id: 'kai',    name: 'Kai',    colors: ['#9C8BF6', '#6B4226', '#1A1620'] },
  { id: 'ezra',   name: 'Ezra',   colors: ['#F5996E', '#DEB887', '#6B4226'] },
  { id: 'joel',   name: 'Joel',   colors: ['#9BC47E', '#C68642', '#2B1A0E'] },
  { id: 'river',  name: 'River',  colors: ['#4FC8D6', '#E0AC69', '#2B2B33'] },
  { id: 'sage',   name: 'Sage',   colors: ['#8FB996', '#FFDBAC', '#8C9BA5'] },
  { id: 'max',    name: 'Max',    colors: ['#7FA0FF', '#FADDBC', '#3A2010'] },
  { id: 'indigo', name: 'Indigo', colors: ['#6E7BD9', '#C68642', '#232038'] },
  { id: 'rowan',  name: 'Rowan',  colors: ['#E9B85C', '#EFB98A', '#6B4A2F'] },
  { id: 'miles',  name: 'Miles',  colors: ['#E98AB6', '#F5CBA7', '#2E1505'] },
  { id: 'ash',    name: 'Ash',    colors: ['#A29CAA', '#D9995F', '#C9CDD4'] },
  { id: 'cruz',   name: 'Cruz',   colors: ['#B795E8', '#8D5524', '#1A0E0A'] },
  { id: 'cove',   name: 'Cove',   colors: ['#5FB6E8', '#6E4326', '#1F1B26'] },
];

const INK = '#241F2B';
const EYE_WHITE = '#FBF7F0';
const GOLD = '#E9B85C';
const BLUSH = '#F0837A';

// djb2 — stable per confession id across renders and sessions
function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getPersona(seed: string): Persona {
  return PERSONAS[hash(seed) % PERSONAS.length];
}

export function getPersonaById(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

export function randomPersona(): Persona {
  return PERSONAS[Math.floor(Math.random() * PERSONAS.length)];
}

// ---------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------

function Neck({ skin }: { skin: string }) {
  return <Rect x="10.3" y="16" width="3.4" height="5" rx="1.5" fill={skin} />;
}

function FaceCircle({ skin }: { skin: string }) {
  return <Circle cx="12" cy="11.6" r="5.6" fill={skin} />;
}

function Eyes({ frames }: { frames?: string }) {
  return (
    <>
      <Ellipse cx="9.7" cy="11.3" rx="1.25" ry="1.5" fill={EYE_WHITE} />
      <Ellipse cx="14.3" cy="11.3" rx="1.25" ry="1.5" fill={EYE_WHITE} />
      <Circle cx="9.95" cy="11.55" r="0.62" fill={INK} />
      <Circle cx="14.55" cy="11.55" r="0.62" fill={INK} />
      <Circle cx="9.75" cy="11.3" r="0.22" fill={EYE_WHITE} />
      <Circle cx="14.35" cy="11.3" r="0.22" fill={EYE_WHITE} />
      {frames && (
        <>
          <Circle cx="9.7" cy="11.3" r="2.1" stroke={frames} strokeWidth="1" fill="none" />
          <Circle cx="14.3" cy="11.3" r="2.1" stroke={frames} strokeWidth="1" fill="none" />
          <Path d="M11.8 11.3h.4" stroke={frames} strokeWidth="1" strokeLinecap="round" />
        </>
      )}
    </>
  );
}

function EyesClosed() {
  return (
    <>
      <Path d="M8.6 11.3q1.1 1 2.2 0" stroke={INK} strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <Path d="M13.2 11.3q1.1 1 2.2 0" stroke={INK} strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </>
  );
}

function Brows() {
  return (
    <>
      <Path d="M8.7 9.3q1-.7 2.1-.3" stroke={INK} strokeWidth="0.9" strokeLinecap="round" fill="none" />
      <Path d="M13.2 9q1.1-.4 2.1.3" stroke={INK} strokeWidth="0.9" strokeLinecap="round" fill="none" />
    </>
  );
}

function Blush() {
  return (
    <>
      <Circle cx="7.9" cy="13.3" r="0.95" fill={BLUSH} opacity={0.4} />
      <Circle cx="16.1" cy="13.3" r="0.95" fill={BLUSH} opacity={0.4} />
    </>
  );
}

function Smile() {
  return (
    <Path
      d="M10.8 14.3q1.2 1 2.4 0"
      stroke={INK}
      strokeWidth="1.1"
      strokeLinecap="round"
      fill="none"
    />
  );
}

function OpenSmile() {
  return (
    <>
      <Path d="M10.5 13.7h3a1.5 1.5 0 0 1-3 0Z" fill={INK} />
      <Rect x="10.9" y="13.7" width="2.2" height="0.5" rx="0.25" fill={EYE_WHITE} />
    </>
  );
}

function Freckles() {
  return (
    <>
      <Circle cx="8.3" cy="12.7" r="0.28" fill={INK} opacity={0.3} />
      <Circle cx="9.1" cy="13.3" r="0.28" fill={INK} opacity={0.3} />
      <Circle cx="15" cy="13.3" r="0.28" fill={INK} opacity={0.3} />
      <Circle cx="15.8" cy="12.7" r="0.28" fill={INK} opacity={0.3} />
    </>
  );
}

// ---------------------------------------------------------------------------
// 12 characters
// ---------------------------------------------------------------------------

function Bust({ id, skin, hair }: { id: string; skin: string; hair: string }) {
  switch (id) {
    case 'kai': // tight buzz cut — close crop, dark skin, no frills
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.8" r="6.1" fill={hair} />
          <FaceCircle skin={skin} />
          {/* Even hairline — buzz sits flat and low across forehead */}
          <Path d="M7.4 10.6c.2-2 1.9-3.4 4.6-3.4s4.4 1.4 4.6 3.4c-3-.8-6.2-.8-9.2 0Z" fill={hair} />
          <Brows />
          <Eyes />
          <Smile />
        </>
      );
    case 'ezra': // short textured quiff + stubble hint
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.8" r="6.3" fill={hair} />
          <FaceCircle skin={skin} />
          {/* Quiff — slight crest at center top */}
          <Path d="M7 10.4c.3-2.6 2.2-4.2 5-4.2 2.7 0 4.7 1.6 5 4.2-3.1-.9-6.9-.9-10 0Z" fill={hair} />
          <Path d="M10.2 7.1q1.8-2.2 3.6-.3" stroke={hair} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          {/* Light stubble along jaw */}
          <Path d="M9 15.2q3 1 6 0" stroke={hair} strokeWidth="1.8" strokeLinecap="round" fill="none" opacity={0.38} />
          <Brows />
          <Eyes />
          <Blush />
          <Smile />
        </>
      );
    case 'joel': // undercut + short full beard
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.4" r="6" fill={hair} />
          <FaceCircle skin={skin} />
          {/* Clean short top, clipped sides implied by tight cap */}
          <Path d="M7.6 10.2c.2-1.8 1.9-3.2 4.4-3.2s4.2 1.4 4.4 3.2c-3-.7-5.8-.7-8.8 0Z" fill={hair} />
          {/* Full short beard — fills in jaw and chin */}
          <Path d="M7.6 12.8c-.5 4 1.9 6.2 4.4 6.2s4.9-2.2 4.4-6.2c-1.1 1.2-2.7 1.8-4.4 1.8s-3.3-.6-4.4-1.8Z" fill={hair} />
          <Path d="M9.9 14.5q2.1 1 4.2 0" stroke={hair} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <Brows />
          <Eyes />
        </>
      );
    case 'river': // sleek dark swoop + stud earring
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.9" r="6.5" fill={hair} />
          <FaceCircle skin={skin} />
          <Path d="M6.5 10.6C6.5 6.9 8.9 5 12.1 5c2.9 0 4.9 1.2 5.7 3.3-3.1 1.9-8.5.7-11.3 2.3Z" fill={hair} />
          <Path d="M8 6.6q2-1.2 4.4-1" stroke="#FFFFFF" strokeWidth="0.7" strokeLinecap="round" fill="none" opacity={0.16} />
          <Brows />
          <Eyes />
          <Blush />
          <Smile />
          <Circle cx="17.5" cy="13.6" r="0.5" fill="#C9CDD4" />
        </>
      );
    case 'sage': // gray hair + full beard + warm closed-mouth smile
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.9" r="6.4" fill={hair} />
          <FaceCircle skin={skin} />
          <Path d="M7 10.2c.4-2.7 2.3-4.2 5-4.2s4.6 1.5 5 4.2c-3.2-1-6.8-1-10 0Z" fill={hair} />
          <Path d="M6.9 12.4c-.5 4.2 2 6.8 5.1 6.8s5.6-2.6 5.1-6.8c-1.2 1.3-3 2-5.1 2s-3.9-.7-5.1-2Z" fill={hair} />
          <Path d="M9.9 14.6q2.1 1.1 4.2 0" stroke={hair} strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <Brows />
          <Eyes />
          <Blush />
        </>
      );
    case 'max': // short crew cut + dark frames + open grin
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.6" r="6.2" fill={hair} />
          <FaceCircle skin={skin} />
          {/* Crew cut — even, close-cropped around the head */}
          <Path d="M7.2 10.4c.3-2.1 2-3.6 4.8-3.6s4.5 1.5 4.8 3.6c-3.1-1-6.5-1-9.6 0Z" fill={hair} />
          <Eyes frames={INK} />
          <Blush />
          <OpenSmile />
        </>
      );
    case 'indigo': // big curly mop + forehead curl
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="7.4" cy="6.8" r="3" fill={hair} />
          <Circle cx="12" cy="5" r="3.4" fill={hair} />
          <Circle cx="16.6" cy="6.8" r="3" fill={hair} />
          <Circle cx="12" cy="10.8" r="6.5" fill={hair} />
          <FaceCircle skin={skin} />
          <Path d="M6.9 10.2c.4-2.9 2.4-4.4 5.1-4.4s4.7 1.5 5.1 4.4c-3.3-1.1-6.9-1.1-10.2 0Z" fill={hair} />
          <Circle cx="9.6" cy="8.6" r="1" fill={hair} />
          <Brows />
          <Eyes />
          <Blush />
          <Smile />
        </>
      );
    case 'rowan': // joyful: closed happy eyes + open grin + freckles
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.6" r="6.6" fill={hair} />
          <FaceCircle skin={skin} />
          <Path d="M6.4 11c-.6-4.8 2.2-7.2 5.6-7.2s6.2 2.4 5.6 7.2c-.9-1.9-1.5-3-2.1-3.8-2 1.2-5 1.2-7 0-.6.8-1.2 1.9-2.1 3.8Z" fill={hair} />
          <EyesClosed />
          <Blush />
          <Freckles />
          <OpenSmile />
        </>
      );
    case 'miles': // clean side part — classic, swept left from right-of-centre
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.9" r="6.3" fill={hair} />
          <FaceCircle skin={skin} />
          {/* Hair mass sweeps left; right side starts at the part */}
          <Path d="M17 10.8c-.3-3.2-2.2-5.1-5-5.1-2.6 0-4.5 1.5-5.2 4 1.8-1.8 5.2-2.4 7.8-1.4 1 .4 1.8.9 2.4 1.5Z" fill={hair} />
          <Path d="M6.8 10.5c.3-2.9 2.2-4.8 5.2-4.8.7 0 1.4.1 2 .3" stroke={hair} strokeWidth="0.8" strokeLinecap="round" fill="none" />
          {/* Part line — thin strip where skin shows through */}
          <Path d="M14.6 5.8 14 10.4" stroke={skin} strokeWidth="0.7" strokeLinecap="round" fill="none" opacity={0.35} />
          <Brows />
          <Eyes />
          <Blush />
          <Smile />
        </>
      );
    case 'ash': // silver spikes + confident angled brows
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="11" r="6.3" fill={hair} />
          <FaceCircle skin={skin} />
          <Path d="M6.1 10.4 7.4 4.8l1.9 2.7 2-3.3 2 3 2.1-2.8 1.6 3.2 1.9-2.1.9 5c-3.4-1.8-10.2-1.9-13.7-.1Z" fill={hair} />
          <Path d="M8.6 9.5l2.1-.5" stroke={INK} strokeWidth="0.9" strokeLinecap="round" fill="none" />
          <Path d="M13.3 9l2.1.5" stroke={INK} strokeWidth="0.9" strokeLinecap="round" fill="none" />
          <Eyes />
          <Blush />
          <Smile />
        </>
      );
    case 'cruz': // short wavy + scruff, open grin
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.8" r="6.4" fill={hair} />
          <FaceCircle skin={skin} />
          {/* Wavy fringe — a gentle S-wave across the forehead */}
          <Path d="M6.9 10.4c.3-2.8 2.1-4.5 5.1-4.5 2.9 0 4.8 1.7 5.1 4.5-3.2-1.1-7-.9-10.2 0Z" fill={hair} />
          <Path d="M7.8 7.8q2.2-1.4 4.2 0 2 1.4 4.2 0" stroke={hair} strokeWidth="1.3" strokeLinecap="round" fill="none" />
          {/* Scruff — light beard shadow below the jaw */}
          <Path d="M8.2 13.6c-.3 3.6 1.7 5.8 3.8 5.8s4.1-2.2 3.8-5.8c-.9 1-2.3 1.5-3.8 1.5s-2.9-.5-3.8-1.5Z" fill={hair} opacity={0.55} />
          <Brows />
          <Eyes />
          <OpenSmile />
        </>
      );
    case 'cove': // tight dark curls + earring + open grin
    default:
      return (
        <>
          <Neck skin={skin} />
          <Circle cx="12" cy="10.8" r="6.5" fill={hair} />
          <Circle cx="6.8" cy="7.6" r="1.5" fill={hair} />
          <Circle cx="9.4" cy="5.6" r="1.5" fill={hair} />
          <Circle cx="12.6" cy="4.9" r="1.5" fill={hair} />
          <Circle cx="15.6" cy="5.8" r="1.5" fill={hair} />
          <Circle cx="17.6" cy="8" r="1.5" fill={hair} />
          <FaceCircle skin={skin} />
          <Path d="M6.9 10.2c.4-2.8 2.4-4.3 5.1-4.3s4.7 1.5 5.1 4.3c-3.3-1.1-6.9-1.1-10.2 0Z" fill={hair} />
          <Brows />
          <Eyes />
          <Blush />
          <OpenSmile />
          <Circle cx="6.4" cy="14.6" r="0.85" fill={GOLD} />
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Badge — solid colour disc so the characters pop on the dark app
// ---------------------------------------------------------------------------

interface BadgeProps {
  persona:   Persona;
  size?:     number;   // badge circle diameter
  showName?: boolean;
}

export function PersonaBadge({ persona, size = 27, showName = true }: BadgeProps) {
  const [tint, skin, hair] = persona.colors;
  // 115% of badge — overflows and clips at the circle edge so the face fills it
  const glyph = Math.round(size * 1.15);
  return (
    <View style={styles.row}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.badge,
          {
            width:           size,
            height:          size,
            // 22% opacity tint — colour is identifiable but not vivid
            backgroundColor: tint + '38',
          },
        ]}
      >
        <Svg width={glyph} height={glyph} viewBox="0 0 24 24">
          <Bust id={persona.id} skin={skin} hair={hair} />
        </Svg>
      </View>
      {showName && (
        <Text style={[styles.name, { color: tint }]}>{persona.name}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           9,
  },
  badge: {
    borderRadius:   radius.pill,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',   // bust crops at the badge edge — neck ends here
  },
  name: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
  },
});
