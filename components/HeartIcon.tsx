import React from 'react';
import { Icon } from './Icon';

/**
 * The felt toggle's heart.
 *
 * A thin wrapper over the icon set rather than a call site swap: this is used
 * in three places with different sizes, and keeping the name means the felt
 * toggle stays one thing to reason about.
 *
 * The `color` prop is gone. The heart carries its own accent now (pink when
 * filled), and a caller-supplied tint would fight it — which is exactly the
 * mistake the old per-type colour map in notifications was making.
 */
export function HeartIcon({
  filled,
  size = 18,
}: {
  filled: boolean;
  size?: number;
}) {
  return <Icon name={filled ? 'heart' : 'heart_empty'} size={size} />;
}
