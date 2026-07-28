export interface ColorSet {
  bg:            string;
  ink:           string;
  paper:         string;
  dim:           string;
  line:          string;
  border:        string;
  accent:        string;
  feltText:      string;
  youreNotAlone: string;
}

export const lightColors: ColorSet = {
  bg:            '#F7F4EF',
  ink:           '#FFFFFF',
  paper:         '#1A1A1A',
  dim:           '#888888',
  line:          'rgba(0,0,0,0.09)',
  border:        '#1A1A1A',
  accent:        '#FFE500',
  feltText:      '#1A1A1A',
  youreNotAlone: 'rgba(26,26,26,0.65)',
};

export const darkColors: ColorSet = {
  bg:            '#0A0A0A',
  ink:           '#141414',
  paper:         '#F5F5F5',
  dim:           '#666666',
  line:          '#2A2A2A',
  border:        '#FFFFFF',
  accent:        '#FFE500',
  feltText:      '#FFE500',
  youreNotAlone: 'rgba(245,245,245,0.80)',
};

// Static fallback — use useThemeColors() for dynamic theming
export const color: ColorSet = lightColors;

export const radius = {
  card:  18,
  input: 14,
  pill:  999,
} as const;

export const spacing = {
  cardPadding:   28,
  screenPadding: 20,
} as const;

export const font = {
  confessionSize:       19,
  confessionLineHeight: 19 * 1.5,  // 28.5
  labelSize:            11,
  labelLetterSpacing:   0.18 * 11, // 1.98
} as const;

export const fontFamily = {
  serif:       'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  serifBold:   'Fraunces_700Bold',
  sans:        'Inter_400Regular',
  sansBold:    'Inter_600SemiBold',
} as const;
