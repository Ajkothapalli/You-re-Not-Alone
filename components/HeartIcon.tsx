import React from 'react';
import Svg, { Path } from 'react-native-svg';

const HEART =
  'M12 20.3 C4.5 14.8 3 10 6.5 7.2 C8.7 5.5 11 6.6 12 8.2 C13 6.6 15.3 5.5 17.5 7.2 C21 10 19.5 14.8 12 20.3 Z';

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
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={HEART}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
