/**
 * soulyap icon set — duotone "sticker" style: indigo outline, white body, one
 * accent colour. GENERATED from the design source; do not hand-edit shape data.
 *
 * States (the three the design distinguishes):
 *   selected    full colour. Also the default for icons that are not stateful.
 *   unselected  muted outline, accent removed — a tab or chip that is not chosen.
 *   disabled    faded; pair it with a non-pressable control.
 *
 * Tone = the surface the icon sits on. 'auto' follows the app theme. Pass
 * tone="light" when the icon sits on a light or yellow surface in either theme
 * (the active nav disc, an active chip): a dark-theme outline would vanish there.
 *
 * Decorative doodles (BackgroundPattern, card corners) deliberately stay on
 * ScrawlIcon — they are texture, not icons.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

export type IconState = 'selected' | 'unselected' | 'disabled';
export type IconTone = 'auto' | 'light' | 'dark';

type Role = 'body' | 'accent' | 'line' | 'dot' | 'ribbon' | 'knock' | 'shine';
type Shape = { r: Role; d?: string; c?: readonly [number, number, number]; w?: 'thin' | 'bold' | 'heavy' };

const SW = 3.2;
const WEIGHT = { thin: SW * 0.8, bold: SW * 1.15, heavy: SW * 1.4 } as const;

const ACCENT: Record<string, string> = {
  "A": "#FF7A2A",
  "B": "#9A78E6",
  "H": "#EF4A7C",
  "cat:mental_health": "#9C8BF6",
  "cat:relationships": "#F5996E",
  "cat:grief": "#7FA0FF",
  "cat:secrets": "#FBBF24",
  "cat:work_identity": "#4FC8D6",
  "cat:body_health": "#9BC47E",
  "cat:faith_meaning": "#B795E8"
};

// Dark theme: brighter / lighter accents that hold contrast on near-black.
const ACCENT_DARK: Record<string, string> = {
  "A": "#FF8A3D",
  "B": "#B49CFF",
  "H": "#FF5C8F",
  "cat:mental_health": "#9C8BF6",
  "cat:relationships": "#F5996E",
  "cat:grief": "#7FA0FF",
  "cat:secrets": "#FBBF24",
  "cat:work_identity": "#4FC8D6",
  "cat:body_health": "#9BC47E",
  "cat:faith_meaning": "#B795E8"
};

const PALETTE = {
  light: {
    selected: { out: '#291466', body: '#FFFFFF', acc: null, mix: null, shine: true, op: 1.0, knock: '#FFFFFF' },
    unselected: { out: '#291466', body: '#FFFFFF', acc: null, mix: ['#FFFFFF', 0.5] as const, shine: false, op: 1.0, knock: '#FFFFFF' },
    disabled: { out: '#CBC6D8', body: '#F7F5FA', acc: '#EFECF4', mix: null, shine: false, op: 0.9, knock: '#F7F5FA' }
  },
  dark: {
    selected: { out: '#F4F1FB', body: '#2B2542', acc: null, mix: null, shine: true, op: 1.0, knock: '#FFFFFF' },
    unselected: { out: '#C9C2DE', body: '#231E35', acc: null, mix: ['#DAD4EA', 0.45] as const, shine: false, op: 1.0, knock: '#1E1A2C' },
    disabled: { out: '#4A4657', body: '#16151C', acc: '#2C2936', mix: null, shine: false, op: 0.9, knock: '#16151C' }
  }
} as const;

const ICONS = {
  book: { a: 'B', s: [
    { r: 'accent', d: "M5 15.5C5 13.8 6.2 12.8 7.9 13L21.5 14.6C23 14.8 24 15.9 24 17.4C24 15.9 25 14.8 26.5 14.6L40.1 13C41.8 12.8 43 13.8 43 15.5V37.2C43 38.7 41.9 39.8 40.4 39.9L27 41C25.4 41.1 24 42.2 24 43.4C24 42.2 22.6 41.1 21 41L7.6 39.9C6.1 39.8 5 38.7 5 37.2Z" },
    { r: 'body', d: "M9 9.8C9 8.6 10 7.7 11.2 7.9C15.4 8.5 19.6 9.9 23 12.3C23.6 12.7 24 13.4 24 14.1V37.2C20.6 35 15.9 33.6 11.1 33.2C9.9 33.1 9 32.1 9 30.9Z" },
    { r: 'body', d: "M39 9.8C39 8.6 38 7.7 36.8 7.9C32.6 8.5 28.4 9.9 25 12.3C24.4 12.7 24 13.4 24 14.1V37.2C27.4 35 32.1 33.6 36.9 33.2C38.1 33.1 39 32.1 39 30.9Z" },
    { r: 'line', d: "M13.5 15.2C15.8 15.6 18 16.4 19.8 17.4M13.5 21.2C15.8 21.6 18 22.4 19.8 23.4" },
    { r: 'accent', d: "M31.5 25.8C29.9 24.6 28.6 23.4 28.6 22C28.6 21 29.4 20.2 30.3 20.2C30.9 20.2 31.3 20.6 31.5 21C31.7 20.6 32.1 20.2 32.7 20.2C33.6 20.2 34.4 21 34.4 22C34.4 23.4 33.1 24.6 31.5 25.8Z", w: 'thin' },
  ] },
  pencil: { a: 'A', s: [
    { r: 'accent', d: "M11.3 29.6L28.3 12.6L35.4 19.7L18.4 36.7Z" },
    { r: 'body', d: "M28.3 12.6L33.3 7.7C35 7.9 40.1 13 40.3 14.8L35.4 19.7Z" },
    { r: 'line', d: "M30.4 10.5L37.5 17.6", w: 'thin' },
    { r: 'body', d: "M11.3 29.6L18.4 36.7L8.5 39.5Z" },
    { r: 'dot', d: "M8.5 39.5L9.6 35.7L12.3 38.4Z" },
    { r: 'shine', d: "M14.5 30L27.9 16.5" },
  ] },
  person: { a: 'B', s: [
    { r: 'accent', d: "M8 41.5C8 33.5 14.9 27.8 24 27.8C33.1 27.8 40 33.5 40 41.5C40 42.3 39.3 43 38.5 43H9.5C8.7 43 8 42.3 8 41.5Z" },
    { r: 'body', c: [24.0, 16.2, 8.6] },
    { r: 'dot', c: [21.0, 16.4, 1.35] },
    { r: 'dot', c: [27.0, 16.4, 1.35] },
    { r: 'line', d: "M21.4 20.2C22.9 21.4 25.1 21.4 26.6 20.2", w: 'thin' },
    { r: 'shine', d: "M15.5 34.5C17.3 32.6 19.7 31.4 22.5 30.9" },
  ] },
  bell: { a: 'A', s: [
    { r: 'body', d: "M24 7.2C31.2 7.2 36 12.6 36 20V28.6L39.6 33.4C40.4 34.5 39.6 36 38.3 36H9.7C8.4 36 7.6 34.5 8.4 33.4L12 28.6V20C12 12.6 16.8 7.2 24 7.2Z" },
    { r: 'accent', d: "M10.6 30.4H37.4L39.6 33.4C40.4 34.5 39.6 36 38.3 36H9.7C8.4 36 7.6 34.5 8.4 33.4Z" },
    { r: 'dot', d: "M19.4 39.2H28.6C28.6 41.8 26.5 43.6 24 43.6C21.5 43.6 19.4 41.8 19.4 39.2Z" },
    { r: 'dot', c: [24.0, 5.6, 2.3] },
    { r: 'line', d: "M17.4 17.4C18 14.6 19.8 12.6 22.2 11.8", w: 'thin' },
  ] },
  arrow_left: { a: 'A', s: [
    { r: 'line', d: "M40 24H9M20.5 12.5L9 24L20.5 35.5", w: 'heavy' },
  ] },
  arrow_right: { a: 'A', s: [
    { r: 'line', d: "M8 24H39M27.5 12.5L39 24L27.5 35.5", w: 'heavy' },
  ] },
  close: { a: 'A', s: [
    { r: 'line', d: "M13 13L35 35M35 13L13 35", w: 'heavy' },
  ] },
  check: { a: 'A', s: [
    { r: 'line', d: "M9.5 25.5L19.5 35L38.5 13.5", w: 'heavy' },
  ] },
  lock: { a: 'B', s: [
    { r: 'line', d: "M15.5 21V15.6C15.5 10.4 19.3 6.8 24 6.8C28.7 6.8 32.5 10.4 32.5 15.6V21", w: 'bold' },
    { r: 'accent', d: "M11.8 21H36.2C38 21 39.4 22.4 39.4 24.2V38.8C39.4 40.6 38 42 36.2 42H11.8C10 42 8.6 40.6 8.6 38.8V24.2C8.6 22.4 10 21 11.8 21Z" },
    { r: 'body', d: "M24 26.4C25.9 26.4 27.2 27.8 27.2 29.5C27.2 30.7 26.6 31.6 25.6 32.1V35.2C25.6 36.1 24.9 36.8 24 36.8C23.1 36.8 22.4 36.1 22.4 35.2V32.1C21.4 31.6 20.8 30.7 20.8 29.5C20.8 27.8 22.1 26.4 24 26.4Z", w: 'thin' },
    { r: 'shine', d: "M13.4 25.2V30.6" },
  ] },
  heart: { a: 'H', s: [
    { r: 'accent', d: "M24 41.2C24 41.2 5.6 30.4 5.6 17.6C5.6 11.9 10 7.6 15.4 7.6C19.2 7.6 22.4 9.7 24 12.8C25.6 9.7 28.8 7.6 32.6 7.6C38 7.6 42.4 11.9 42.4 17.6C42.4 30.4 24 41.2 24 41.2Z" },
    { r: 'shine', d: "M11.6 17.4C11.6 14.6 13.4 12.8 15.8 12.6" },
  ] },
  heart_empty: { a: 'H', s: [
    { r: 'line', d: "M24 41.2C24 41.2 5.6 30.4 5.6 17.6C5.6 11.9 10 7.6 15.4 7.6C19.2 7.6 22.4 9.7 24 12.8C25.6 9.7 28.8 7.6 32.6 7.6C38 7.6 42.4 11.9 42.4 17.6C42.4 30.4 24 41.2 24 41.2Z", w: 'bold' },
  ] },
  star: { a: 'A', s: [
    { r: 'accent', d: "M24 5.6L29.2 16.2L40.8 17.9C42.1 18.1 42.6 19.7 41.7 20.6L33.3 28.8L35.3 40.4C35.5 41.7 34.1 42.7 32.9 42.1L24 37.4L15.1 42.1C13.9 42.7 12.5 41.7 12.7 40.4L14.7 28.8L6.3 20.6C5.4 19.7 5.9 18.1 7.2 17.9L18.8 16.2Z" },
    { r: 'shine', d: "M17.2 21.2L20.4 20.8" },
  ] },
  infinity: { a: 'B', s: [
    { r: 'ribbon', d: "M24 24C20.6 19.2 17.4 16 13.6 16C9.1 16 6 19.6 6 24C6 28.4 9.1 32 13.6 32C17.4 32 20.6 28.8 24 24C27.4 19.2 30.6 16 34.4 16C38.9 16 42 19.6 42 24C42 28.4 38.9 32 34.4 32C30.6 32 27.4 28.8 24 24Z" },
  ] },
  lightning: { a: 'A', s: [
    { r: 'accent', d: "M27.6 4.8L10.8 26.4C10.1 27.3 10.7 28.6 11.9 28.6H21.2L18.8 42.4C18.6 43.5 20 44.1 20.7 43.2L37.3 21.6C38 20.7 37.4 19.4 36.2 19.4H27L29.9 6C30.1 4.9 28.3 3.9 27.6 4.8Z" },
    { r: 'shine', d: "M24.8 11.8L16.6 22.6" },
  ] },
  sun: { a: 'A', s: [
    { r: 'line', d: "M24 3.8V8.6M24 39.4V44.2M3.8 24H8.6M39.4 24H44.2M9.7 9.7L13.1 13.1M34.9 34.9L38.3 38.3M38.3 9.7L34.9 13.1M13.1 34.9L9.7 38.3", w: 'bold' },
    { r: 'accent', c: [24.0, 24.0, 10.2] },
    { r: 'shine', d: "M18.6 22.4C19 20.4 20.4 19 22.4 18.6" },
  ] },
  moon: { a: 'B', s: [
    { r: 'accent', d: "M30.8 7.4C25 8.2 20.6 13.3 20.6 19.4C20.6 26.1 26 31.5 32.7 31.5C35.8 31.5 38.6 30.3 40.8 28.4C39.4 36.8 32.1 43.2 23.4 43.2C13.7 43.2 5.8 35.3 5.8 25.6C5.8 15.4 14.2 7.1 24.5 7.1C26.7 7.1 28.8 7.2 30.8 7.4Z" },
    { r: 'dot', d: "M37.6 7.2L38.6 10.2L41.6 11.2L38.6 12.2L37.6 15.2L36.6 12.2L33.6 11.2L36.6 10.2Z" },
    { r: 'shine', d: "M12.6 26.6C12.8 30.6 15.4 34 19 35.4" },
  ] },
  mic: { a: 'B', s: [
    { r: 'line', d: "M11.8 23.2C11.8 30.3 17.3 35.6 24 35.6C30.7 35.6 36.2 30.3 36.2 23.2M24 35.6V42.2M17.4 42.4H30.6", w: 'bold' },
    { r: 'body', d: "M24 5.6C28.1 5.6 30.8 8.5 30.8 12.4V23C30.8 26.9 28.1 29.8 24 29.8C19.9 29.8 17.2 26.9 17.2 23V12.4C17.2 8.5 19.9 5.6 24 5.6Z" },
    { r: 'accent', d: "M17.2 17.6H30.8V23C30.8 26.9 28.1 29.8 24 29.8C19.9 29.8 17.2 26.9 17.2 23Z" },
  ] },
  play: { a: 'A', s: [
    { r: 'accent', d: "M15.4 9.6C15.4 7.9 17.3 6.9 18.7 7.8L38.3 21.6C39.6 22.5 39.6 24.4 38.3 25.3L18.7 39.1C17.3 40.1 15.4 39.1 15.4 37.4Z" },
    { r: 'shine', d: "M20 15.4V20.8" },
  ] },
  pause: { a: 'A', s: [
    { r: 'accent', d: "M12.4 9.6C12.4 8.3 13.4 7.4 14.6 7.4H18.8C20 7.4 21 8.3 21 9.6V38.4C21 39.7 20 40.6 18.8 40.6H14.6C13.4 40.6 12.4 39.7 12.4 38.4Z" },
    { r: 'accent', d: "M27 9.6C27 8.3 28 7.4 29.2 7.4H33.4C34.6 7.4 35.6 8.3 35.6 9.6V38.4C35.6 39.7 34.6 40.6 33.4 40.6H29.2C28 40.6 27 39.7 27 38.4Z" },
  ] },
  shield: { a: 'B', s: [
    { r: 'body', d: "M24 4.8L39.2 10.4C40.3 10.8 41 11.8 41 13V22.8C41 32.2 34 39.4 24.9 43.1C24.3 43.3 23.7 43.3 23.1 43.1C14 39.4 7 32.2 7 22.8V13C7 11.8 7.7 10.8 8.8 10.4Z" },
    { r: 'accent', d: "M24 31.6C21 29.4 17.6 26.9 17.6 23.4C17.6 21.3 19.2 19.7 21.1 19.7C22.4 19.7 23.5 20.4 24 21.5C24.5 20.4 25.6 19.7 26.9 19.7C28.8 19.7 30.4 21.3 30.4 23.4C30.4 26.9 27 29.4 24 31.6Z", w: 'thin' },
  ] },
  no_reply: { a: 'A', s: [
    { r: 'body', d: "M9.6 8.4H38.4C40.4 8.4 42 10 42 12V29.6C42 31.6 40.4 33.2 38.4 33.2H22.4L14 40.6C13.1 41.4 11.8 40.8 11.8 39.6V33.2H9.6C7.6 33.2 6 31.6 6 29.6V12C6 10 7.6 8.4 9.6 8.4Z" },
    { r: 'accent', d: "M15.6 19.2H32.4C33.8 19.2 34.8 20.2 34.8 21.4C34.8 22.6 33.8 23.6 32.4 23.6H15.6C14.2 23.6 13.2 22.6 13.2 21.4C13.2 20.2 14.2 19.2 15.6 19.2Z", w: 'thin' },
  ] },
  check_circle: { a: 'B', s: [
    { r: 'accent', c: [24.0, 24.0, 18.4] },
    { r: 'knock', d: "M15.6 24.6L21.4 30.2L32.6 18.2" },
    { r: 'shine', d: "M12.4 20C13.4 16.6 15.8 13.9 18.9 12.5" },
  ] },
  cat_mental_health: { a: 'cat:mental_health', s: [
    { r: 'accent', d: "M24 9.6C20.6 6.6 13.9 7.4 12.6 12.4C7.9 13.2 6.2 18.8 8.9 22.4C6 26.2 7.9 32.4 12.8 32.8C13.8 38 19.8 40.6 24 37.4C28.2 40.6 34.2 38 35.2 32.8C40.1 32.4 42 26.2 39.1 22.4C41.8 18.8 40.1 13.2 35.4 12.4C34.1 7.4 27.4 6.6 24 9.6Z" },
    { r: 'line', d: "M24 10.4V36.6M15.8 16.8C18.2 17.6 18.8 20.4 16.6 22.4M32.2 16.8C29.8 17.6 29.2 20.4 31.4 22.4M15.4 28.2C18.6 27.6 20.2 29.6 19.4 32.2M32.6 28.2C29.4 27.6 27.8 29.6 28.6 32.2", w: 'thin' },
    { r: 'shine', d: "M11.8 20.4C11.9 17.8 13.4 15.8 15.6 15.2" },
  ] },
  cat_relationships: { a: 'cat:relationships', s: [
    { r: 'accent', d: "M 18.60 33.13C 18.60 33.13 4.98 25.14 4.98 15.66C 4.98 11.45 8.24 8.26 12.24 8.26C 15.05 8.26 17.42 9.82 18.60 12.11C 19.78 9.82 22.15 8.26 24.96 8.26C 28.96 8.26 32.22 11.45 32.22 15.66C 32.22 25.14 18.60 33.13 18.60 33.13Z" },
    { r: 'body', d: "M 30.40 40.26C 30.40 40.26 18.99 33.57 18.99 25.63C 18.99 22.10 21.72 19.43 25.07 19.43C 27.42 19.43 29.41 20.73 30.40 22.66C 31.39 20.73 33.38 19.43 35.73 19.43C 39.08 19.43 41.81 22.10 41.81 25.63C 41.81 33.57 30.40 40.26 30.40 40.26Z" },
    { r: 'shine', d: "M9.6 17.6C9.7 15.6 11 14.2 12.8 14" },
  ] },
  cat_grief: { a: 'cat:grief', s: [
    { r: 'body', c: [23.0, 24.6, 17.4] },
    { r: 'dot', c: [17.2, 21.6, 1.9] },
    { r: 'dot', c: [28.8, 21.6, 1.9] },
    { r: 'line', d: "M17.4 32.4C20.6 29.4 25.4 29.4 28.6 32.4", w: 'bold' },
    { r: 'accent', d: "M36.6 25.2C38.6 28 40.4 30.6 40.4 32.8C40.4 35 38.7 36.6 36.6 36.6C34.5 36.6 32.8 35 32.8 32.8C32.8 30.6 34.6 28 36.6 25.2Z", w: 'thin' },
  ] },
  cat_secrets: { a: 'cat:secrets', s: [
    { r: 'line', d: "M15.5 21V15.6C15.5 10.4 19.3 6.8 24 6.8C28.7 6.8 32.5 10.4 32.5 15.6V21", w: 'bold' },
    { r: 'accent', d: "M11.8 21H36.2C38 21 39.4 22.4 39.4 24.2V38.8C39.4 40.6 38 42 36.2 42H11.8C10 42 8.6 40.6 8.6 38.8V24.2C8.6 22.4 10 21 11.8 21Z" },
    { r: 'dot', d: "M24 26.4C25.9 26.4 27.2 27.8 27.2 29.5C27.2 30.7 26.6 31.6 25.6 32.1V35.2C25.6 36.1 24.9 36.8 24 36.8C23.1 36.8 22.4 36.1 22.4 35.2V32.1C21.4 31.6 20.8 30.7 20.8 29.5C20.8 27.8 22.1 26.4 24 26.4Z" },
    { r: 'shine', d: "M13.4 25.2V30.6" },
  ] },
  cat_work_identity: { a: 'cat:work_identity', s: [
    { r: 'accent', d: "M21.4 33.4H26.6V41.6C26.6 43 25.4 44 24 44C22.6 44 21.4 43 21.4 41.6Z" },
    { r: 'accent', c: [24.0, 19.6, 15.2] },
    { r: 'body', c: [24.0, 19.6, 10.2] },
    { r: 'line', d: "M19.2 16.8L22.4 13.6M19.6 21.6L27.2 14", w: 'thin' },
  ] },
  cat_body_health: { a: 'cat:body_health', s: [
    { r: 'line', d: "M24 40V24.4", w: 'bold' },
    { r: 'accent', d: "M24 26.2C24 26.2 12.6 26.8 9.6 18.6C8.6 15.8 9.4 12.8 9.4 12.8C9.4 12.8 19.4 11.6 22.8 19.2C24 22 24 26.2 24 26.2Z" },
    { r: 'accent', d: "M24 22.6C24 22.6 25.6 11.8 33.8 8.8C36.6 7.8 39.6 8.4 39.6 8.4C39.6 8.4 40.4 18.4 32.8 21.6C30 22.8 24 22.6 24 22.6Z" },
    { r: 'body', d: "M9.4 40.2C11.8 36.4 17.2 34 24 34C30.8 34 36.2 36.4 38.6 40.2C39.2 41.2 38.5 42.4 37.4 42.4H10.6C9.5 42.4 8.8 41.2 9.4 40.2Z" },
    { r: 'shine', d: "M13.6 16.2C16.4 16.8 18.6 18.4 19.8 20.8" },
  ] },
  cat_faith_meaning: { a: 'cat:faith_meaning', s: [
    { r: 'line', d: "M24 7V12.4M11.2 12.6L14.8 16.2M36.8 12.6L33.2 16.2M5.8 25.4H10.4M37.6 25.4H42.2", w: 'bold' },
    { r: 'accent', d: "M11.6 32.6C11.6 25.4 17.2 19.6 24 19.6C30.8 19.6 36.4 25.4 36.4 32.6Z" },
    { r: 'line', d: "M5.6 32.6H42.4M12.4 38.6H35.6", w: 'bold' },
    { r: 'shine', d: "M17 28.8C17.6 26.2 19.4 24.4 21.8 23.8" },
  ] },
} satisfies Record<string, { a: string; s: readonly Shape[] }>;

export type IconName = keyof typeof ICONS;

/** Blend colour a toward b by t — an unselected icon keeps its own colour, lightened. */
function mixHex(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2]
    .map((i) => Math.floor(ch(a, i) + (ch(b, i) - ch(a, i)) * t + 0.5).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

type Props = {
  name: IconName;
  size?: number;
  state?: IconState;
  tone?: IconTone;
  style?: StyleProp<ViewStyle>;
  /** Set only when the icon carries meaning on its own; otherwise it is hidden from screen readers. */
  accessibilityLabel?: string;
};

export function IconGlyph({ name, size = 24, state = 'selected', tone = 'auto', style, accessibilityLabel }: Props) {
  const { isDark } = useTheme();
  const t = tone === 'auto' ? (isDark ? 'dark' : 'light') : tone;
  const p = PALETTE[t][state];
  const icon = ICONS[name];
  const own = (t === 'dark' ? ACCENT_DARK : ACCENT)[icon.a];
  const acc = p.acc ?? (p.mix ? mixHex(own, p.mix[0], p.mix[1]) : own);
  const els: React.ReactNode[] = [];
  const round = { strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  (icon.s as readonly Shape[]).forEach((sh, i) => {
    const w = sh.w ? WEIGHT[sh.w] : SW;
    const draw = (k: string, props: Record<string, unknown>) =>
      sh.c
        ? <Circle key={k} cx={sh.c[0]} cy={sh.c[1]} r={sh.c[2]} {...props} />
        : <Path key={k} d={sh.d} {...props} />;
    switch (sh.r) {
      case 'body':   els.push(draw(`${i}`, { fill: p.body, stroke: p.out, strokeWidth: w, ...round })); break;
      case 'accent': els.push(draw(`${i}`, { fill: acc, stroke: p.out, strokeWidth: w, ...round })); break;
      case 'line':   els.push(draw(`${i}`, { fill: 'none', stroke: p.out, strokeWidth: w, ...round })); break;
      case 'dot':    els.push(draw(`${i}`, { fill: p.out })); break;
      case 'ribbon':
        els.push(draw(`${i}a`, { fill: 'none', stroke: p.out, strokeWidth: SW * 2.9, ...round }));
        els.push(draw(`${i}b`, { fill: 'none', stroke: acc, strokeWidth: SW * 1.25, ...round }));
        break;
      case 'knock':
        els.push(draw(`${i}a`, { fill: 'none', stroke: p.out, strokeWidth: SW * 2.2, ...round }));
        els.push(draw(`${i}b`, { fill: 'none', stroke: p.knock, strokeWidth: SW * 0.95, ...round }));
        break;
      case 'shine':
        if (p.shine) els.push(draw(`${i}`, { fill: 'none', stroke: '#FFFFFF', strokeOpacity: 0.75, strokeWidth: SW * 0.75, ...round }));
        break;
    }
  });
  const labelled = !!accessibilityLabel;
  return (
    <View
      style={[{ width: size, height: size }, style]}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!labelled}
      importantForAccessibility={labelled ? 'yes' : 'no-hide-descendants'}
    >
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <G opacity={p.op}>{els}</G>
      </Svg>
    </View>
  );
}

export const Icon = React.memo(IconGlyph);
