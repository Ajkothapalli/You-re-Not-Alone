/**
 * Persona — the cast's avatars, drawn in the illustration voice
 * (docs/design/illustration.md): one confident ink line, flat print colour
 * off-register under it, palette strictly from ILL_COLOR, hair as identity,
 * face = brows + dot eyes + mouth in the quiet register.
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
 * The drawing data below is GENERATED from the design source; do not
 * hand-edit it. It is a print: it never inverts in dark mode. The badge disc
 * is an opaque paper tint of the persona colour so the ink always sits on
 * paper, and only the ring follows the app theme.
 */

import React from 'react';
import { useThemeColors } from '../theme/ThemeProvider';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { font, fontFamily, radius } from '../theme/tokens';

export interface Persona {
  id:   string;
  name: string;
  // [tint, skin, hair] — tint drives the badge background + name colour
  colors: [string, string, string];
}

export const PERSONAS: Persona[] = [
  { id: 'kai',    name: 'Kai',    colors: ['#9C8BF6', '#8E5A3C', '#1A1A1A'] },
  { id: 'ezra',   name: 'Ezra',   colors: ['#F5996E', '#D3A57C', '#1A1A1A'] },
  { id: 'joel',   name: 'Joel',   colors: ['#9BC47E', '#D3A57C', '#1A1A1A'] },
  { id: 'river',  name: 'River',  colors: ['#4FC8D6', '#D3A57C', '#1A1A1A'] },
  { id: 'sage',   name: 'Sage',   colors: ['#8FB996', '#F1DCC4', '#B9B2A6'] },
  { id: 'max',    name: 'Max',    colors: ['#7FA0FF', '#F1DCC4', '#1A1A1A'] },
  { id: 'indigo', name: 'Indigo', colors: ['#6E7BD9', '#D3A57C', '#1A1A1A'] },
  { id: 'rowan',  name: 'Rowan',  colors: ['#E9B85C', '#F1DCC4', '#1A1A1A'] },
  { id: 'miles',  name: 'Miles',  colors: ['#E98AB6', '#F1DCC4', '#1A1A1A'] },
  { id: 'ash',    name: 'Ash',    colors: ['#A29CAA', '#D3A57C', '#B9B2A6'] },
  { id: 'cruz',   name: 'Cruz',   colors: ['#B795E8', '#8E5A3C', '#1A1A1A'] },
  { id: 'cove',   name: 'Cove',   colors: ['#5FB6E8', '#8E5A3C', '#1A1A1A'] },
];


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
// Drawing (generated)
// ---------------------------------------------------------------------------

type Op = {
  k: 'p' | 'c';
  d?: string; cx?: number; cy?: number; r?: number;
  fill?: string; stroke?: string; strokeWidth?: number;
  strokeLinecap?: 'round'; strokeLinejoin?: 'round';
  transform?: string;
};

// 64x64 grid, head centre (32,26) r16. Paints back-to-front.
const ART: Record<string, readonly Op[]> = {
  kai: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#8E5A3C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#E8927C" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#8E5A3C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.4 24C15.6 14.2 22.6 8.6 32 8.6C41.4 8.6 48.4 14.2 47.6 24C44.2 18.8 38.6 16.8 32 16.8C25.4 16.8 19.8 18.8 16.4 24Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.4 24C15.6 14.2 22.6 8.6 32 8.6C41.4 8.6 48.4 14.2 47.6 24C44.2 18.8 38.6 16.8 32 16.8C25.4 16.8 19.8 18.8 16.4 24Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.1q3-1 7-.4M35 21.7q4-.6 7 .4", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M27.6 35q4.4 2.4 8.8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  ezra: [
    { k: "p", d: "M14.4 30C12.6 15 20.4 7.8 32 7.8C43.6 7.8 51.4 15 49.6 30C49.1 34.4 47.6 37.8 45.8 39L45.8 25L18.2 25L18.2 39C16.4 37.8 14.9 34.4 14.4 30Z", fill: "#1A1A1A" },
    { k: "p", d: "M14.4 30C12.6 15 20.4 7.8 32 7.8C43.6 7.8 51.4 15 49.6 30C49.1 34.4 47.6 37.8 45.8 39L45.8 25L18.2 25L18.2 39C16.4 37.8 14.9 34.4 14.4 30Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#D3A57C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#AEC6A4" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#D3A57C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.2 23C17.6 13.8 24.6 9.6 32.6 9.6C40.6 9.6 46.4 14.2 47.6 22.4C42.2 17.2 35.2 15.8 28.4 19C24.2 21 20.2 22.2 16.2 23Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.2 23C17.6 13.8 24.6 9.6 32.6 9.6C40.6 9.6 46.4 14.2 47.6 22.4C42.2 17.2 35.2 15.8 28.4 19C24.2 21 20.2 22.2 16.2 23Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.5l7-1M35 21.5l7 1", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M27 32.4C29 31 31 31.4 32 32.2C33 31.4 35 31 37 32.4C35 33.8 33 33.4 32 32.8C31 33.4 29 33.8 27 32.4Z", fill: "#1A1A1A" },
    { k: "p", d: "M27 32.4C29 31 31 31.4 32 32.2C33 31.4 35 31 37 32.4C35 33.8 33 33.4 32 32.8C31 33.4 29 33.8 27 32.4Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M29.6 36.2q2.4 1.2 4.8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  joel: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#D3A57C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#9DB4C8" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#D3A57C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.4 27.4C16.8 36.6 22.8 42.4 32 42.4C41.2 42.4 47.2 36.6 47.6 27.4C45.4 31.8 42.2 34 38.6 34.2C36 32.6 34 32.2 32 33C30 32.2 28 32.6 25.4 34.2C21.8 34 18.6 31.8 16.4 27.4Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.4 27.4C16.8 36.6 22.8 42.4 32 42.4C41.2 42.4 47.2 36.6 47.6 27.4C45.4 31.8 42.2 34 38.6 34.2C36 32.6 34 32.2 32 33C30 32.2 28 32.6 25.4 34.2C21.8 34 18.6 31.8 16.4 27.4Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M17 22.6C17 13.2 23.4 9 32 9C40.6 9 47 13.2 47 22.6C43.4 18.8 38.2 17.6 32 17.6C25.8 17.6 20.6 18.8 17 22.6Z", fill: "#1A1A1A" },
    { k: "p", d: "M17 22.6C17 13.2 23.4 9 32 9C40.6 9 47 13.2 47 22.6C43.4 18.8 38.2 17.6 32 17.6C25.8 17.6 20.6 18.8 17 22.6Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.5l7-1M35 21.5l7 1", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M29.6 36.8q2.4 1 4.8 0", fill: "none", stroke: "#D3A57C", strokeWidth: 1.6, strokeLinecap: "round" },
  ],
  river: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#D3A57C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#E9D8B8" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#D3A57C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.4 25C15.4 13.8 22.8 8 32.4 8C42.4 8 48.8 14.2 47.6 25.6C45.4 21 43.4 18.8 40.4 17.4C35.8 21.6 26 24 16.4 25Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.4 25C15.4 13.8 22.8 8 32.4 8C42.4 8 48.8 14.2 47.6 25.6C45.4 21 43.4 18.8 40.4 17.4C35.8 21.6 26 24 16.4 25Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.1q3-1 7-.4M35 21.7q4-.6 7 .4", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M27.6 35q4.4 2.4 8.8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 47.8, cy: 34.6, r: 1.8, fill: "#E9D8B8", stroke: "#1A1A1A", strokeWidth: 2.0 },
  ],
  sage: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#F1DCC4", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#E8927C" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#F1DCC4" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M17 28.4C17.6 37 23.4 41.6 32 41.6C40.6 41.6 46.4 37 47 28.4C44.8 32.4 41.8 34.4 38.4 34.6C36 33.2 34 32.8 32 33.4C30 32.8 28 33.2 25.6 34.6C22.2 34.4 19.2 32.4 17 28.4Z", fill: "#B9B2A6" },
    { k: "p", d: "M17 28.4C17.6 37 23.4 41.6 32 41.6C40.6 41.6 46.4 37 47 28.4C44.8 32.4 41.8 34.4 38.4 34.6C36 33.2 34 32.8 32 33.4C30 32.8 28 33.2 25.6 34.6C22.2 34.4 19.2 32.4 17 28.4Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M17 23C16.6 13.6 23.4 9.2 32 9.2C40.6 9.2 47.4 13.6 47 23C45 18.6 41.6 16.6 37.6 16.4L35.2 13.4C31.6 16.8 23 17.2 17 23Z", fill: "#B9B2A6" },
    { k: "p", d: "M17 23C16.6 13.6 23.4 9.2 32 9.2C40.6 9.2 47.4 13.6 47 23C45 18.6 41.6 16.6 37.6 16.4L35.2 13.4C31.6 16.8 23 17.2 17 23Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M35.2 13.4L37.6 16.4", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.5q3-1.2 7 0M35 22.5q4-1.2 7 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M24 27.6q3 3 6 0M34 27.6q3 3 6 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M29.6 36.6q2.4 1.2 4.8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  max: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#F1DCC4", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#9DB4C8" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#F1DCC4" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.8 24C15.8 12.6 23.6 8.2 32 8.2C40.6 8.2 48.4 12.8 47.2 24C45.4 20.2 43.6 18.4 41.2 17.6C40.4 19.2 38.6 20 36.8 19.8C35.6 17.8 33.6 17 31.6 17.6C29.6 20 26.8 20.8 24.2 19.8C22.6 20 19 21.2 16.8 24Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.8 24C15.8 12.6 23.6 8.2 32 8.2C40.6 8.2 48.4 12.8 47.2 24C45.4 20.2 43.6 18.4 41.2 17.6C40.4 19.2 38.6 20 36.8 19.8C35.6 17.8 33.6 17 31.6 17.6C29.6 20 26.8 20.8 24.2 19.8C22.6 20 19 21.2 16.8 24Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.5l7-1M35 21.5l7 1", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 27.0, cy: 27.5, r: 4.2, fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0 },
    { k: "c", cx: 37.0, cy: 27.5, r: 4.2, fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0 },
    { k: "p", d: "M31.2 27.2Q32 26.4 32.8 27.2M22.8 26.8L17 25.6M41.2 26.8L47 25.6", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M28 35q4 2 8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  indigo: [
    { k: "p", d: "M13 26C9.4 23 10.4 16 15.4 14.4C15.4 8.4 22 5 26.6 7C29 3.8 35 3.8 37.4 7C42 5 48.6 8.4 48.6 14.4C53.6 16 54.6 23 51 26C49 21.4 45.6 18.4 32 18.4C18.4 18.4 15 21.4 13 26Z", fill: "#1A1A1A" },
    { k: "p", d: "M13 26C9.4 23 10.4 16 15.4 14.4C15.4 8.4 22 5 26.6 7C29 3.8 35 3.8 37.4 7C42 5 48.6 8.4 48.6 14.4C53.6 16 54.6 23 51 26C49 21.4 45.6 18.4 32 18.4C18.4 18.4 15 21.4 13 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#D3A57C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#AEC6A4" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#D3A57C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.4 24C15.6 14.2 22.6 8.6 32 8.6C41.4 8.6 48.4 14.2 47.6 24C44.2 18.8 38.6 16.8 32 16.8C25.4 16.8 19.8 18.8 16.4 24Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.4 24C15.6 14.2 22.6 8.6 32 8.6C41.4 8.6 48.4 14.2 47.6 24C44.2 18.8 38.6 16.8 32 16.8C25.4 16.8 19.8 18.8 16.4 24Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.1q3-1 7-.4M35 21.7q4-.6 7 .4", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M27.6 35q4.4 2.4 8.8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  rowan: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#F1DCC4", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#E8927C" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#F1DCC4" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M15.6 27C14.4 14 21.8 8 32 8C42.2 8 49.6 14 48.4 27C47.4 24.2 46.8 22.4 46 21.2C40 22.6 24 22.6 18 21.2C17.2 22.4 16.6 24.2 15.6 27Z", fill: "#1A1A1A" },
    { k: "p", d: "M15.6 27C14.4 14 21.8 8 32 8C42.2 8 49.6 14 48.4 27C47.4 24.2 46.8 22.4 46 21.2C40 22.6 24 22.6 18 21.2C17.2 22.4 16.6 24.2 15.6 27Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 21.5q3-2 7 0M35 21.5q4-2 7 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M24 27.6q3 3 6 0M34 27.6q3 3 6 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M27 35q5 3 10 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 23.0, cy: 31.6, r: 0.75, fill: "#1A1A1A" },
    { k: "c", cx: 24.9, cy: 32.8, r: 0.75, fill: "#1A1A1A" },
    { k: "c", cx: 41.0, cy: 31.6, r: 0.75, fill: "#1A1A1A" },
    { k: "c", cx: 39.1, cy: 32.8, r: 0.75, fill: "#1A1A1A" },
  ],
  miles: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#F1DCC4", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#E9D8B8" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#F1DCC4" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M17 23C16.4 13.6 23.2 9 32 9C40.8 9 47.6 13.6 47 23C43.6 19 38.4 17.6 32 17.6C25.6 17.6 20.4 19 17 23Z", fill: "#1A1A1A" },
    { k: "p", d: "M17 23C16.4 13.6 23.2 9 32 9C40.8 9 47.6 13.6 47 23C43.6 19 38.4 17.6 32 17.6C25.6 17.6 20.4 19 17 23Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M35.6 9.8C36.8 6.4 40.2 5 42.4 6.2C40.4 6.8 39 8.2 38.6 10.6Z", fill: "#1A1A1A" },
    { k: "p", d: "M35.6 9.8C36.8 6.4 40.2 5 42.4 6.2C40.4 6.8 39 8.2 38.6 10.6Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.7l7-1.4M35 21.1l7 1", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M29.4 35.6q2.6 1.6 5.2 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  ash: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#D3A57C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#9DB4C8" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#D3A57C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.6 24C15.8 16 18 11.6 21.4 10.4L20.8 6.2L25.6 8.8L27.4 4.6L31.4 8.2L34.8 4.4L36.6 8.6L41.4 6.4L41.2 10.6C45.4 12 48.2 16.4 47.4 24C44 19.4 38.6 17.6 32 17.6C25.4 17.6 20 19.4 16.6 24Z", fill: "#B9B2A6" },
    { k: "p", d: "M16.6 24C15.8 16 18 11.6 21.4 10.4L20.8 6.2L25.6 8.8L27.4 4.6L31.4 8.2L34.8 4.4L36.6 8.6L41.4 6.4L41.2 10.6C45.4 12 48.2 16.4 47.4 24C44 19.4 38.6 17.6 32 17.6C25.4 17.6 20 19.4 16.6 24Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.5l7-1M35 21.5l7 1", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M28 35q4 2 8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  cruz: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#8E5A3C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#AEC6A4" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#8E5A3C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M26 36.6C27.2 40.6 29.4 42.2 32 42.2C34.6 42.2 36.8 40.6 38 36.6C36 37.8 34.2 38.2 32 38.2C29.8 38.2 28 37.8 26 36.6Z", fill: "#1A1A1A" },
    { k: "p", d: "M26 36.6C27.2 40.6 29.4 42.2 32 42.2C34.6 42.2 36.8 40.6 38 36.6C36 37.8 34.2 38.2 32 38.2C29.8 38.2 28 37.8 26 36.6Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.4 24C15.6 14.2 22.6 8.6 32 8.6C41.4 8.6 48.4 14.2 47.6 24C44.2 18.8 38.6 16.8 32 16.8C25.4 16.8 19.8 18.8 16.4 24Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.4 24C15.6 14.2 22.6 8.6 32 8.6C41.4 8.6 48.4 14.2 47.6 24C44.2 18.8 38.6 16.8 32 16.8C25.4 16.8 19.8 18.8 16.4 24Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.5l7-1M35 21.5l7 1", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M27.4 32.4C29.4 31.2 31 31.6 32 32.2C33 31.6 34.6 31.2 36.6 32.4C34.8 33.6 33 33.2 32 32.7C31 33.2 29.2 33.6 27.4 32.4Z", fill: "#1A1A1A" },
    { k: "p", d: "M27.4 32.4C29.4 31.2 31 31.6 32 32.2C33 31.6 34.6 31.2 36.6 32.4C34.8 33.6 33 33.2 32 32.7C31 33.2 29.2 33.6 27.4 32.4Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M29.8 35.1q2.2 1 4.4 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
  ],
  cove: [
    { k: "p", d: "M32 40L32 50", stroke: "#1A1A1A", strokeWidth: 10.0, strokeLinecap: "round" },
    { k: "p", d: "M32 40L32 50", stroke: "#8E5A3C", strokeWidth: 6.4, strokeLinecap: "round" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "#E8927C" },
    { k: "p", d: "M9 66C9 55.2 17.6 49 26.6 48C28.4 50.4 30.2 51.2 32 51.2C33.8 51.2 35.6 50.4 37.4 48C46.4 49 55 55.2 55 66Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "#8E5A3C" },
    { k: "p", d: "M16 26A16 16 0 1 0 48 26A16 16 0 1 0 16 26Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M16.6 24C14.6 20.6 15.8 16 19 15C18.6 11.4 22 8.4 25.6 9.4C27.2 6.6 31.4 6 33.8 8.2C36.6 6.4 40.8 7.6 41.8 10.8C45.6 11 48 14.6 47 18.2C49.4 20 49.2 22.6 47.4 24C44 19.6 38.4 18 32 18C25.6 18 20 19.6 16.6 24Z", fill: "#1A1A1A" },
    { k: "p", d: "M16.6 24C14.6 20.6 15.8 16 19 15C18.6 11.4 22 8.4 25.6 9.4C27.2 6.6 31.4 6 33.8 8.2C36.6 6.4 40.8 7.6 41.8 10.8C45.6 11 48 14.6 47 18.2C49.4 20 49.2 22.6 47.4 24C44 19.6 38.4 18 32 18C25.6 18 20 19.6 16.6 24Z", fill: "none", stroke: "#1A1A1A", strokeWidth: 3.4, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "p", d: "M22 22.1q3-1 7-.4M35 21.7q4-.6 7 .4", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 27.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "c", cx: 37.0, cy: 27.5, r: 1.8, fill: "#1A1A1A" },
    { k: "p", d: "M27.6 35q4.4 2.4 8.8 0", fill: "none", stroke: "#1A1A1A", strokeWidth: 2.0, strokeLinecap: "round", strokeLinejoin: "round" },
    { k: "c", cx: 16.2, cy: 34.6, r: 1.8, fill: "#E9D8B8", stroke: "#1A1A1A", strokeWidth: 2.0 },
  ],
};

// Opaque paper tint of each persona's colour — the disc the print sits on.
const BADGE_BG: Record<string, string> = {
  kai: '#DED7F3',
  ezra: '#F9DCCA',
  joel: '#DEE8CF',
  river: '#C7EAEA',
  sage: '#DBE5D6',
  max: '#D6DEF6',
  indigo: '#D1D2EA',
  rowan: '#F6E5C5',
  miles: '#F6D7E0',
  ash: '#E0DCDC',
  cruz: '#E7DAEF',
  cove: '#CCE4EF',
};

function renderOp(op: Op, i: number) {
  const { k, transform, ...rest } = op;
  const el = k === 'p'
    ? <Path key={i} d={rest.d} fill={rest.fill} stroke={rest.stroke} strokeWidth={rest.strokeWidth}
            strokeLinecap={rest.strokeLinecap} strokeLinejoin={rest.strokeLinejoin} />
    : <Circle key={i} cx={rest.cx} cy={rest.cy} r={rest.r} fill={rest.fill} stroke={rest.stroke} strokeWidth={rest.strokeWidth} />;
  // Off-register fills and the pressure pass carry a translate.
  return transform ? <G key={i} transform={transform}>{el}</G> : el;
}

/** The persona drawn on the 64x64 grid (head, neck, shoulders). */
export function Bust({ id }: { id: string }) {
  const ops = ART[id] ?? ART[PERSONAS[0].id];
  return <G>{ops.map(renderOp)}</G>;
}

// Framing of the bust inside the disc.
const K = 1.05;
const FRAME = `translate(${32 - 32 * K} ${32 - 32 * K}) scale(${K})`;

interface BadgeProps {
  persona:   Persona;
  size?:     number;   // badge circle diameter
  showName?: boolean;
}

export function PersonaBadge({ persona, size = 27, showName = true }: BadgeProps) {
  const [tint] = persona.colors;
  // The ring follows the theme (a hardcoded #1A1A1A ring vanished on dark
  // cards). The disc does not: it is paper, so the ink drawing reads in both.
  const themeColor = useThemeColors();
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
            borderColor:     themeColor.border,
            backgroundColor: BADGE_BG[persona.id] ?? BADGE_BG[PERSONAS[0].id],
          },
        ]}
      >
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <G transform={FRAME}>
            <Bust id={persona.id} />
          </G>
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
    overflow:       'hidden',
    borderWidth:    2,
  },
  name: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
  },
});
