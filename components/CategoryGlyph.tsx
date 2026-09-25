import React from 'react';
import { Icon, type IconName } from './Icon';
import type { CategoryId } from '@/lib/categories';

/**
 * The seven category chips.
 *
 * Previously ~190 lines of hand-drawn gradient shapes with their own PAL
 * colour table and a module-level id counter for gradient uniqueness. All of
 * that now lives in the generated icon set, where each category carries its
 * own accent colour — so the table and the counter are gone with it.
 *
 * CategoryGlyph (the large standalone drawing) went too: nothing imported it.
 * CategoryBadge keeps its name because app/welcome.tsx renders it.
 */

/**
 * CategoryId -> IconName, checked by the compiler rather than by a cast.
 *
 * A `\`cat_${id}\` as IconName` template would compile for any id, including
 * one added to CATEGORY_IDS without a matching icon — which would render
 * nothing and fail silently. Spelling the map out means adding a category
 * without an icon is a build error.
 */
const CATEGORY_ICON: Record<CategoryId, IconName> = {
  mental_health: 'cat_mental_health',
  relationships: 'cat_relationships',
  grief:         'cat_grief',
  secrets:       'cat_secrets',
  work_identity: 'cat_work_identity',
  body_health:   'cat_body_health',
  faith_meaning: 'cat_faith_meaning',
};

export function CategoryBadge({ id, size = 50 }: { id: CategoryId; size?: number }) {
  return <Icon name={CATEGORY_ICON[id]} size={size} />;
}
