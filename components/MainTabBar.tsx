import { Pressable, StyleSheet, Text, View } from 'react-native';

interface TabBarProps {
  state:      { routes: Array<{ name: string }>; index: number };
  navigation: { navigate: (name: string) => void };
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useThemeColors } from '@/theme/ThemeProvider';
import { useNotificationsContext } from '@/lib/notificationsContext';
import { fontFamily } from '@/theme/tokens';
import { ScrawlIcon } from './ScrawlIcon';

const BAR_H  = 49;
const ICON   = 22;
const GOLD   = '#FFE500';

// Material Design path data, 24x24 viewBox (write tab uses ScrawlIcon instead)
const ICON_PATHS: Record<string, string> = {
  read: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  you: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  notifications: 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
};

const LABELS: Record<string, string> = {
  read:          'Read',
  write:         'Write',
  you:           'You',
  notifications: 'Alerts',
};

export default function MainTabBar({ state, navigation }: TabBarProps) {
  const insets         = useSafeAreaInsets();
  const color          = useThemeColors();
  const { unreadCount } = useNotificationsContext();

  return (
    <View
      style={[
        styles.root,
        {
          height:          BAR_H + (insets.bottom || 0),
          paddingBottom:   insets.bottom || 0,
          backgroundColor: color.ink,
          borderTopColor:  color.line,
        },
      ]}
    >
      {state.routes.map((route, i) => {
        const focused   = state.index === i;
        const isWrite   = route.name === 'write';
        const iconColor = isWrite ? GOLD : focused ? color.paper : color.dim;
        const pathData  = ICON_PATHS[route.name] ?? '';
        const label     = LABELS[route.name] ?? route.name;
        const hasBadge  = route.name === 'notifications' && unreadCount > 0;

        return (
          <Pressable
            key={route.name}
            style={styles.tab}
            onPress={() => navigation.navigate(route.name)}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
          >
            <View style={styles.iconWrap}>
              {isWrite ? (
                <ScrawlIcon name="pencil" size={24} color={iconColor} roughen={false} strokeWidth={5} />
              ) : (
                <Svg width={ICON} height={ICON} viewBox="0 0 24 24">
                  <Path d={pathData} fill={iconColor} />
                </Svg>
              )}
              {hasBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : String(unreadCount)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, { color: iconColor }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection:  'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     8,
    gap:            3,
  },
  iconWrap: {
    position: 'relative',
  },
  badge: {
    position:          'absolute',
    top:               -4,
    right:             -8,
    backgroundColor:   '#EF4444',
    borderRadius:      8,
    minWidth:          16,
    height:            16,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontFamily: fontFamily.sansBold,
    fontSize:   9,
    color:      '#FFFFFF',
    lineHeight: 12,
  },
  label: {
    fontFamily:    fontFamily.sans,
    fontSize:      10,
    letterSpacing: 0.2,
  },
});
