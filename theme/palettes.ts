export interface Palette {
  name:  string;
  you:   string;                      // warm accent — "you wrote" label + card shadow
  them:  string;                      // cool accent — "they wrote" label
  bands: readonly [string, string, string]; // unused after neo-brutalism; kept for compat
}

// Sequential rotation: open #k → palettes[(k - 1) % 6]
export const palettes: readonly Palette[] = [
  {
    name:  'Voltage',
    you:   '#FFE500',
    them:  '#00E5C8',
    bands: ['#141400', '#001A14', '#0A0A0A'],
  },
  {
    name:  'Flame',
    you:   '#FF4F00',
    them:  '#FF00AA',
    bands: ['#1A1000', '#1A0014', '#0A0A0A'],
  },
  {
    name:  'Acid',
    you:   '#CCFF00',
    them:  '#7B00FF',
    bands: ['#0E1400', '#0C0024', '#0A0A0A'],
  },
  {
    name:  'Cyber',
    you:   '#00D4FF',
    them:  '#FF6B00',
    bands: ['#001A1A', '#180E00', '#0A0A0A'],
  },
  {
    name:  'Violet',
    you:   '#B388FF',
    them:  '#FF80AB',
    bands: ['#0E0024', '#1A0012', '#0A0A0A'],
  },
  {
    name:  'Blaze',
    you:   '#FF4444',
    them:  '#FFE500',
    bands: ['#1A0800', '#141400', '#0A0A0A'],
  },
] as const;
