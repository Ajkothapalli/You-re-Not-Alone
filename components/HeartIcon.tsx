import React from 'react';
import Svg, { Path } from 'react-native-svg';

// Same path as ScrawlIcon's "heart" entry — 48×48 viewBox, round stroke
const HEART = 'M24 41C24 41 4 28 4 16C4 9 9 4 16 4C20 4 23 7 24 9C25 7 28 4 32 4C39 4 44 9 44 16C44 28 24 41 24 41Z';

export function HeartIcon({
  filled,
  color,
  size = 18,
}: {
  filled: boolean;
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        d={HEART}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}
