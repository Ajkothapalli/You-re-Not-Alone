export interface Palette {
  name:  string;
  you:   string;                      // warm accent — "you wrote" label
  them:  string;                      // cool accent — "they wrote" label
  bands: readonly [string, string, string]; // [back, mid, front] wave colours
}

// Sequential rotation: open #k → palettes[(k - 1) % 6]
export const palettes: readonly Palette[] = [
  {
    name:  'Sunset',
    you:   '#F5996E',
    them:  '#9C8BF6',
    bands: ['#4C40A4', '#A8407A', '#BD5435'],
  },
  {
    name:  'Ember & Rose',
    you:   '#F0A06E',
    them:  '#F08AB0',
    bands: ['#9C3F7A', '#C2545E', '#D0803A'],
  },
  {
    name:  'Rose-gold',
    you:   '#E9B85C',
    them:  '#E98AB6',
    bands: ['#6E2F66', '#C24E86', '#D9A24E'],
  },
  {
    name:  'Ocean',
    you:   '#4FC8D6',
    them:  '#6E96FF',
    bands: ['#2A3D8F', '#2B6FB0', '#2AA39B'],
  },
  {
    name:  'Amber & Indigo',
    you:   '#F2B25C',
    them:  '#9A8BF6',
    bands: ['#3F368C', '#8A4A7E', '#C8822E'],
  },
  {
    name:  'Twilight',
    you:   '#B0A0FF',
    them:  '#7FA0FF',
    bands: ['#2E2A6E', '#4A3E9E', '#7E68DC'],
  },
] as const;
