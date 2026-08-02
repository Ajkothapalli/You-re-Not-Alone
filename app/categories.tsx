/**
 * Category picker — shown once after account creation (post-DOB).
 * Also reachable from profile to edit preferences.
 *
 * Save is non-blocking: if reader_preferences doesn't exist yet (migration
 * pending) we log the failure and route through anyway.
 */

import { CATEGORIES } from '@/lib/categories';
import { getReaderPreferences, saveReaderPreferences } from '@/lib/api';
import { announce } from '@/lib/a11y';
import { PrimaryButton, GhostButton } from '@/components/Buttons';
import { ScrawlIcon } from '@/components/ScrawlIcon';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { showDialog } from '@/components/AppDialog';

// ─── chip ────────────────────────────────────────────────────────────────────

type ChipProps = {
  label:       string;
  description: string;
  id:          string;
  selected:    boolean;
  width:       number;
  onToggle:    (id: string) => void;
};

function CategoryChip({ label, description, id, selected, width, onToggle }: ChipProps) {
  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);
  const ON_BG  = '#FFE500';
  const ON_FG  = '#1A1A1A';

  // Drives the inner dot appearing / disappearing (native thread only)
  const dotScale  = useRef(new Animated.Value(selected ? 1 : 0)).current;
  // Subtle card press-in/out feedback
  const cardScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(dotScale, {
      toValue:         selected ? 1 : 0,
      useNativeDriver: true,
      tension:         220,
      friction:        22,   // overdamped — no bounce
    }).start();
  }, [selected]);

  function onPressIn() {
    Animated.spring(cardScale, {
      toValue: 0.97, useNativeDriver: true, tension: 400, friction: 20,
    }).start();
  }
  function onPressOut() {
    Animated.spring(cardScale, {
      toValue: 1, useNativeDriver: true, tension: 300, friction: 18,
    }).start();
  }

  return (
    <Animated.View
      style={{ width, paddingRight: SHADOW, paddingBottom: SHADOW, transform: [{ scale: cardScale }] }}
      accessible={false}
      importantForAccessibility="no"
    >
      <View pointerEvents="none" style={styles.chipShadow} />
      <Pressable
        onPress={() => onToggle(id)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.chip, selected && { backgroundColor: ON_BG, borderColor: ON_FG }]}
        accessible={true}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${label}. ${description}`}
      >
        {/* Purely decorative — state conveyed via accessibilityState. */}
        <View
          style={[styles.circle, selected && { backgroundColor: ON_FG, borderColor: ON_FG }]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View style={{ transform: [{ scale: dotScale }] }}>
            <ScrawlIcon name="checkmark" size={12} color={selected ? ON_BG : color.border} roughen={false} strokeWidth={3} />
          </Animated.View>
        </View>

        <Text style={[styles.chipLabel, selected && { color: ON_FG }]}>{label}</Text>
        <Text style={[styles.chipDesc, selected && { color: ON_FG, opacity: 0.65 }]} numberOfLines={3}>{description}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const params                 = useLocalSearchParams<{ mode?: string }>();
  const isEdit                 = params.mode === 'edit';

  const color  = useThemeColors();
  const styles = useMemo(() => createStyles(color), [color]);

  // Two columns, 10px gap, 20px side padding each side
  const cardWidth = (screenWidth - spacing.screenPadding * 2 - 10) / 2;

  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [saving,       setSaving]       = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    getReaderPreferences()
      .then(prefs => {
        if (prefs) setSelected(new Set(prefs.categories));
      })
      .catch(() => {})
      .finally(() => setLoadingPrefs(false));
  }, []);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) {
      showDialog('Choose at least one', 'Pick at least one kind of confession to read.');
      return;
    }
    setSaving(true);
    try {
      await saveReaderPreferences([...selected]);
    } catch (err) {
      console.warn('[categories] preferences save failed:', err);
    } finally {
      setSaving(false);
    }
    announce('Preferences saved.');
    router.replace(isEdit ? '../' : '/read');
  }

  function handleSkip() {
    router.replace(isEdit ? '../' : '/read');
  }

  if (loadingPrefs) return <View style={{ flex: 1 }} />;

  return (
    <View style={styles.root}>
    <ScrollView
      style={styles.scroller}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          {isEdit ? 'Reading categories' : 'What do you want to read?'}
        </Text>
        <Text style={styles.sub}>
          {isEdit
            ? 'Change what kinds of confessions appear in Explore.'
            : 'Choose what you\'d like to carry with you. You can change this anytime.'}
        </Text>
      </View>

      {/* 2-column grid — exact widths from useWindowDimensions.
          Last card gets full row width when total count is odd. */}
      <View style={styles.grid}>
        {CATEGORIES.map((cat, idx) => {
          return (
            <CategoryChip
              key={cat.id}
              id={cat.id}
              label={cat.label}
              description={cat.hint}
              selected={selected.has(cat.id)}
              width={cardWidth}
              onToggle={toggle}
            />
          );
        })}
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label={saving ? 'Saving…' : (isEdit ? 'Save' : 'Continue')}
          onPress={handleSave}
          loading={saving}
          disabled={selected.size === 0}
        />
        <GhostButton label={isEdit ? 'Cancel' : 'Skip for now'} onPress={handleSkip} />
      </View>
    </ScrollView>
    </View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const SHADOW = 4;

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    root: {
      flex:            1,
      backgroundColor: color.bg,
    },
    scroller: { flex: 1 },
    scroll: {
      padding:       spacing.screenPadding,
      paddingTop:    8,
      paddingBottom: 32,
      gap:           20,
    },
    backLabel: { fontFamily: fontFamily.sans, fontSize: 14, color: color.dim },

    header: {
      gap: 8,
    },
    heading: {
      fontFamily: fontFamily.sansBold,
      fontSize:   26,
      color:      color.paper,
      lineHeight: 34,
    },
    sub: {
      fontFamily: fontFamily.sans,
      fontSize:   14,
      color:      color.dim,
      lineHeight: 21,
    },

    grid: {
      flexDirection: 'row',
      flexWrap:      'wrap',
      gap:           10,
    },

    chipShadow: {
      position:        'absolute',
      top:             SHADOW,
      left:            SHADOW,
      right:           0,
      bottom:          0,
      borderRadius:    radius.input,
      backgroundColor: '#1A1A1A',
    },
    chip: {
      backgroundColor: color.ink,
      borderRadius:    radius.input,
      padding:         18,
      borderWidth:     2,
      borderColor:     color.border,
      minHeight:       120,
      gap:             8,
    },

    // square check indicator
    circle: {
      position:       'absolute',
      top:            14,
      right:          14,
      width:          22,
      height:         22,
      borderRadius:   4,
      borderWidth:    2,
      borderColor:    color.border,
      alignItems:     'center',
      justifyContent: 'center',
    },

    chipLabel: {
      fontFamily:  fontFamily.sansBold,
      fontSize:    14,
      color:       color.paper,
      paddingRight: 28,
    },

    chipDesc: {
      fontFamily: fontFamily.sans,
      fontSize:   13,
      color:      color.dim,
      lineHeight: 18,
    },

    actions: { gap: 12 },
  });
}
