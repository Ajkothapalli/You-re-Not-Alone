import { CATEGORIES, CATEGORY_IDS, CLASSIFIER_TAXONOMY } from '@/lib/categories';
import type { Category, CategoryId } from '@/lib/categories';

describe('lib/categories', () => {
  it('has exactly 7 categories', () => {
    expect(CATEGORIES).toHaveLength(7);
  });

  it('CATEGORY_IDS matches CATEGORIES order', () => {
    expect(CATEGORIES.map(c => c.id)).toEqual([...CATEGORY_IDS]);
  });

  it('CLASSIFIER_TAXONOMY equals CATEGORY_IDS', () => {
    expect(CLASSIFIER_TAXONOMY).toEqual([...CATEGORY_IDS]);
  });

  it('every category has required fields', () => {
    for (const cat of CATEGORIES) {
      expect(typeof cat.id).toBe('string');
      expect(typeof cat.label).toBe('string');
      expect(typeof cat.hint).toBe('string');
      expect(typeof cat.description).toBe('string');
      expect(typeof cat.color).toBe('string');
      // color must be a valid hex colour
      expect(cat.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('no category has an emoji field (removed)', () => {
    for (const cat of CATEGORIES) {
      expect(cat).not.toHaveProperty('emoji');
    }
  });

  // CLAUDE.md §5: sexual/adult category is REMOVED
  it('does not include a sexuality_intimacy or adult category', () => {
    const ids = CATEGORIES.map(c => c.id);
    expect(ids).not.toContain('sexuality_intimacy');
    expect(ids).not.toContain('adult');
    expect(ids).not.toContain('sexual');
  });

  // CLAUDE.md §5: crisis is never a category
  it('does not include a crisis category', () => {
    const ids = CATEGORIES.map(c => c.id);
    expect(ids).not.toContain('crisis');
    expect(ids).not.toContain('mental_crisis');
  });

  it('all category IDs in CATEGORY_IDS are unique', () => {
    const unique = new Set(CATEGORY_IDS);
    expect(unique.size).toBe(CATEGORY_IDS.length);
  });

  it('hint is shorter than description (hint is the scannable version)', () => {
    for (const cat of CATEGORIES) {
      expect(cat.hint.length).toBeLessThan(cat.description.length);
    }
  });
});
