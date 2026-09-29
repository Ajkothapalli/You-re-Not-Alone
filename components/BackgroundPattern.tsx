import React from 'react';
import { useWindowDimensions, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { ICON_PATHS } from './ScrawlIcon';
import { useThemeColors } from '../theme/ThemeProvider';

// 6-column staggered grid, 12 rows — full-coverage wallpaper tile.
// Odd rows offset +8% so icons brick-shift and avoid a visible grid.
const PATTERN: Array<{ name: string; top: string; left: string; size: number; rotate: number }> = [
  // Row 1
  { name: 'heart',       top: '1%',  left: '2%',  size: 28, rotate: 15  },
  { name: 'thought',     top: '2%',  left: '19%', size: 30, rotate: -20 },
  { name: 'feather',     top: '0%',  left: '36%', size: 26, rotate: -44 },
  { name: 'star',        top: '2%',  left: '53%', size: 24, rotate: 12  },
  { name: 'moon',        top: '1%',  left: '70%', size: 30, rotate: -8  },
  { name: 'bubble',      top: '3%',  left: '85%', size: 26, rotate: 5   },
  // Row 2 (shifted +8%)
  { name: 'wave',        top: '9%',  left: '10%', size: 36, rotate: 8   },
  { name: 'butterfly',   top: '8%',  left: '28%', size: 28, rotate: -12 },
  { name: 'leaf',        top: '10%', left: '44%', size: 24, rotate: 35  },
  { name: 'candle',      top: '8%',  left: '61%', size: 26, rotate: -5  },
  { name: 'birds_fly',   top: '9%',  left: '77%', size: 32, rotate: 0   },
  { name: 'flower',      top: '7%',  left: '92%', size: 22, rotate: 20  },
  // Row 3
  { name: 'quote_mark',  top: '17%', left: '2%',  size: 30, rotate: 15  },
  { name: 'fire',        top: '16%', left: '19%', size: 26, rotate: 10  },
  { name: 'infinity',    top: '18%', left: '36%', size: 28, rotate: -15 },
  { name: 'teardrop',    top: '16%', left: '53%', size: 24, rotate: 18  },
  { name: 'eye',         top: '17%', left: '70%', size: 26, rotate: -10 },
  { name: 'bell',        top: '16%', left: '86%', size: 28, rotate: -18 },
  // Row 4 (shifted +8%)
  { name: 'seedling',    top: '25%', left: '10%', size: 28, rotate: 22  },
  { name: 'lightning',   top: '24%', left: '27%', size: 26, rotate: 25  },
  { name: 'hug',         top: '26%', left: '44%', size: 30, rotate: 0   },
  { name: 'knot',        top: '24%', left: '61%', size: 26, rotate: -28 },
  { name: 'paint_drop',  top: '25%', left: '78%', size: 24, rotate: -12 },
  { name: 'bird',        top: '23%', left: '93%', size: 22, rotate: 30  },
  // Row 5
  { name: 'fingerprint', top: '33%', left: '1%',  size: 26, rotate: 10  },
  { name: 'moon',        top: '32%', left: '18%', size: 30, rotate: -5  },
  { name: 'heart',       top: '34%', left: '35%', size: 26, rotate: 20  },
  { name: 'feather',     top: '32%', left: '52%', size: 28, rotate: -38 },
  { name: 'star',        top: '33%', left: '70%', size: 24, rotate: 15  },
  { name: 'cloud',       top: '32%', left: '86%', size: 30, rotate: -5  },
  // Row 6 (shifted +8%)
  { name: 'spiral',      top: '41%', left: '8%',  size: 24, rotate: 0   },
  { name: 'thought',     top: '40%', left: '26%', size: 26, rotate: -18 },
  { name: 'wave',        top: '42%', left: '42%', size: 34, rotate: 12  },
  { name: 'butterfly',   top: '40%', left: '60%', size: 28, rotate: -8  },
  { name: 'knot',        top: '41%', left: '77%', size: 26, rotate: 0   },
  { name: 'sun',         top: '39%', left: '92%', size: 22, rotate: 45  },
  // Row 7
  { name: 'infinity',    top: '49%', left: '2%',  size: 28, rotate: -15 },
  { name: 'candle',      top: '48%', left: '18%', size: 24, rotate: -8  },
  { name: 'leaf',        top: '50%', left: '36%', size: 26, rotate: 35  },
  { name: 'seedling',    top: '48%', left: '53%', size: 26, rotate: -20 },
  { name: 'teardrop',    top: '49%', left: '70%', size: 24, rotate: 15  },
  { name: 'bubble',      top: '48%', left: '86%', size: 28, rotate: 8   },
  // Row 8 (shifted +8%)
  { name: 'fire',        top: '57%', left: '10%', size: 28, rotate: 5   },
  { name: 'quote_mark',  top: '56%', left: '28%', size: 30, rotate: 20  },
  { name: 'birds_fly',   top: '58%', left: '44%', size: 30, rotate: 0   },
  { name: 'hug',         top: '56%', left: '62%', size: 28, rotate: -5  },
  { name: 'bird',        top: '57%', left: '78%', size: 26, rotate: 10  },
  { name: 'moon',        top: '55%', left: '93%', size: 24, rotate: 10  },
  // Row 9
  { name: 'lightning',   top: '65%', left: '2%',  size: 26, rotate: 22  },
  { name: 'eye',         top: '64%', left: '19%', size: 26, rotate: -8  },
  { name: 'heart',       top: '66%', left: '36%', size: 30, rotate: 12  },
  { name: 'paint_drop',  top: '64%', left: '54%', size: 24, rotate: -15 },
  { name: 'fingerprint', top: '65%', left: '71%', size: 24, rotate: 5   },
  { name: 'star',        top: '63%', left: '87%', size: 26, rotate: 30  },
  // Row 10 (shifted +8%)
  { name: 'bell',        top: '73%', left: '8%',  size: 28, rotate: -18 },
  { name: 'butterfly',   top: '72%', left: '26%', size: 32, rotate: 10  },
  { name: 'spiral',      top: '74%', left: '44%', size: 22, rotate: 0   },
  { name: 'wave',        top: '72%', left: '61%', size: 36, rotate: -8  },
  { name: 'cloud',       top: '73%', left: '78%', size: 28, rotate: 5   },
  { name: 'feather',     top: '71%', left: '93%', size: 24, rotate: -40 },
  // Row 11
  { name: 'thought',     top: '81%', left: '2%',  size: 28, rotate: -15 },
  { name: 'knot',        top: '80%', left: '19%', size: 28, rotate: -25 },
  { name: 'fire',        top: '82%', left: '36%', size: 26, rotate: 8   },
  { name: 'hug',         top: '80%', left: '54%', size: 30, rotate: 0   },
  { name: 'teardrop',    top: '81%', left: '71%', size: 24, rotate: 20  },
  { name: 'flower',      top: '79%', left: '87%', size: 28, rotate: -5  },
  // Row 12 (shifted +8%)
  { name: 'seedling',    top: '89%', left: '10%', size: 24, rotate: 18  },
  { name: 'quote_mark',  top: '88%', left: '28%', size: 26, rotate: 15  },
  { name: 'heart',       top: '90%', left: '44%', size: 28, rotate: -10 },
  { name: 'lightning',   top: '88%', left: '62%', size: 24, rotate: 20  },
  { name: 'eye',         top: '89%', left: '79%', size: 26, rotate: -5  },
  { name: 'fingerprint', top: '87%', left: '93%', size: 22, rotate: 10  },
];

// ONE <Svg>, not 72.
//
// This used to mount 72 separate <Svg> elements — 72 native view trees, plus
// 72 wrapping <View>s — purely for decoration at 10% opacity. It is on every
// tab screen plus read-detail and confession/[id], so it was the single
// largest contributor to view count on most of the app.
//
// Drawing all 72 inside one <Svg> is one native view. The look is unchanged:
// the same paths at the same positions, sizes and rotations, with stroke
// width divided by the scale factor so the drawn line stays 2.5px as it did
// when each icon had its own viewBox.
//
// Still memoized: it takes no props and depends only on the theme's `paper`
// colour, so without it the whole pattern re-rendered whenever its parent did
// for any unrelated reason.
export const BackgroundPattern = React.memo(function BackgroundPattern() {
  const color = useThemeColors();
  const { width, height } = useWindowDimensions();

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrapper]} pointerEvents="none">
      <Svg width={width} height={height}>
        {PATTERN.map((item, i) => {
          // Percentages resolved here because one <Svg> has no per-child
          // layout: each doodle is positioned by a transform instead.
          const x = (parseFloat(item.left as string) / 100) * width;
          const y = (parseFloat(item.top  as string) / 100) * height;
          const k = item.size / 48;                 // icons are a 48x48 space
          const paths = ICON_PATHS[item.name] ?? ICON_PATHS['heart'];

          return (
            <G
              key={i}
              transform={
                `translate(${x}, ${y}) rotate(${item.rotate}, ${item.size / 2}, ${item.size / 2}) scale(${k})`
              }
              stroke={color.paper}
              strokeWidth={2.5 / k}                 // keeps the drawn width constant
              strokeLinejoin="round"
              strokeLinecap="round"
              fill="none"
            >
              {paths.map((d, j) => <Path key={j} d={d} />)}
            </G>
          );
        })}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { opacity: 0.10 },
  icon:    { position: 'absolute' },
});
