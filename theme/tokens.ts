export const color = {
  bg:            '#0A0A0A',
  ink:           '#141414',
  paper:         '#F5F5F5',
  dim:           '#666666',
  line:          '#2A2A2A',
  border:        '#FFFFFF',
  accent:        '#FFE500',
  feltText:      '#FFE500',
  youreNotAlone: 'rgba(245,245,245,0.80)',
} as const;

export const radius = {
  card:  4,
  input: 4,
  pill:  4,
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
