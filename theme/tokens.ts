export const color = {
  ink:           '#0E0C13',                  // app + card background
  paper:         '#F3EEE8',                  // primary text
  dim:           '#A29CAA',                  // muted text / labels
  line:          'rgba(243,238,232,0.10)',   // hairlines / dividers
  feltText:      '#F4E2D5',                  // footer "X felt this too"
  youreNotAlone: 'rgba(255,255,255,0.85)',   // footer right
} as const;

export const radius = {
  card:  26,
  input: 16,
  pill:  999,
} as const;

export const spacing = {
  cardPadding:   30,
  screenPadding: 20,
} as const;

export const font = {
  confessionSize:       19,
  confessionLineHeight: 19 * 1.5,  // 28.5
  labelSize:            11,
  labelLetterSpacing:   0.18 * 11, // 1.98
} as const;

// Font family strings (must match the keys passed to useFonts)
export const fontFamily = {
  serif:       'Fraunces_400Regular',
  serifItalic: 'Fraunces_400Regular_Italic',
  serifBold:   'Fraunces_700Bold',
  sans:        'Inter_400Regular',
  sansBold:    'Inter_600SemiBold',
} as const;
