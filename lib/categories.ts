export const CATEGORY_IDS = [
  'mental_health',
  'relationships',
  'grief',
  'secrets',
  'work_identity',
  'body_health',
  'faith_meaning',
] as const;

export type CategoryId = typeof CATEGORY_IDS[number];

export interface Category {
  id:          CategoryId;
  label:       string;
  /** 2–4 word scannable hint shown on the picker tile (low cognitive load). */
  hint:        string;
  /** Full sentence — used where more context helps; NOT the picker default. */
  description: string;
  /** Accent colour for the tile tint, icon badge, and selected state. */
  color:       string;
}

export const CATEGORIES: Category[] = [
  {
    id:          'mental_health',
    label:       'Mental health',
    hint:        'the weight no one sees',
    description: 'Anxiety, depression, loneliness, the weight no one sees',
    color:       '#9C8BF6',
  },
  {
    id:          'relationships',
    label:       'Relationships',
    hint:        'love & the unsaid',
    description: 'Love, family, friendships, the things left unsaid',
    color:       '#F5996E',
  },
  {
    id:          'grief',
    label:       'Grief & loss',
    hint:        'what we carry',
    description: 'What we carry when someone or something is gone',
    color:       '#7FA0FF',
  },
  {
    id:          'secrets',
    label:       'Secrets & guilt',
    hint:        'what we hide',
    description: "Things we did, truths we hide, weight that won't lift",
    color:       '#FBBF24',
  },
  {
    id:          'work_identity',
    label:       'Work & identity',
    hint:        "who you'd become",
    description: "Ambition, failure, who you thought you'd become",
    color:       '#4FC8D6',
  },
  {
    id:          'body_health',
    label:       'Body & health',
    hint:        "the body's protests",
    description: "Illness, chronic pain, the body's quiet protests",
    color:       '#9BC47E',
  },
  {
    id:          'faith_meaning',
    label:       'Faith & meaning',
    hint:        'doubt & meaning',
    description: 'Doubt, belief, searching for why any of this matters',
    color:       '#B795E8',
  },
];

// The set of category IDs the classifier may assign.
export const CLASSIFIER_TAXONOMY: CategoryId[] = [...CATEGORY_IDS];
