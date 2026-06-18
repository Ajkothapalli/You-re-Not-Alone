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
  description: string;
}

export const CATEGORIES: Category[] = [
  {
    id:          'mental_health',
    label:       'Mental health',
    description: 'Anxiety, depression, loneliness, the weight no one sees',
  },
  {
    id:          'relationships',
    label:       'Relationships',
    description: 'Love, family, friendships, the things left unsaid',
  },
  {
    id:          'grief',
    label:       'Grief & loss',
    description: 'What we carry when someone or something is gone',
  },
  {
    id:          'secrets',
    label:       'Secrets & guilt',
    description: 'Things we did, truths we hide, weight that won\'t lift',
  },
  {
    id:          'work_identity',
    label:       'Work & identity',
    description: 'Ambition, failure, who you thought you\'d become',
  },
  {
    id:          'body_health',
    label:       'Body & health',
    description: 'Illness, chronic pain, the body\'s quiet protests',
  },
  {
    id:          'faith_meaning',
    label:       'Faith & meaning',
    description: 'Doubt, belief, searching for why any of this matters',
  },
];

// The set of category IDs the classifier may assign.
export const CLASSIFIER_TAXONOMY: CategoryId[] = [...CATEGORY_IDS];
