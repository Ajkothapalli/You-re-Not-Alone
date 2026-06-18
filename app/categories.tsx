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
import { color, font, fontFamily, radius, spacing } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

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
    // accessible={false} prevents the animated wrapper from becoming a separate
    // accessibility element on Android before the inner Pressable can claim focus.
    <Animated.View
      style={{ width, transform: [{ scale: cardScale }] }}
      accessible={false}
      importantForAccessibility="no"
    >
      <Pressable
        onPress={() => onToggle(id)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.chip, selected && styles.chipOn]}
        accessible={true}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        // Merge label + description so VoiceOver reads both on a single swipe
        // (hints require an extra gesture and are often skipped by users).
        accessibilityLabel={`${label}. ${description}`}
      >
        {/* Purely decorative — state is already conveyed via accessibilityState.
            Hidden from both iOS VoiceOver and Android TalkBack so the ✓ glyph
            isn't announced as a separate "check mark" element. */}
        <View
          style={[styles.circle, selected && styles.circleOn]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.Text style={[styles.circleDot, { transform: [{ scale: dotScale }] }]}>✓</Animated.Text>
        </View>

        <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{label}</Text>
        <Text style={styles.chipDesc} numberOfLines={3}>{description}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const params                 = useLocalSearchParams<{ mode?: string }>();
  const isEdit                 = params.mode === 'edit';

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
      Alert.alert('Choose at least one', 'Pick at least one kind of confession to read.');
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

  if (loadingPrefs) return <View style={styles.root} />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      {isEdit && (
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backLabel}>← back</Text>
        </Pressable>
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {isEdit ? 'reading categories' : 'what do you want to read?'}
      </Text>
      <Text style={styles.sub}>
        {isEdit
          ? 'Change what kinds of confessions appear in Explore.'
          : 'Choose what you\'d like to carry with you. You can change this anytime.'}
      </Text>

      {/* 2-column grid — exact widths from useWindowDimensions.
          Last card gets full row width when total count is odd. */}
      <View style={styles.grid}>
        {CATEGORIES.map((cat, idx) => {
          const isLastAlone = CATEGORIES.length % 2 !== 0 && idx === CATEGORIES.length - 1;
          const w = isLastAlone ? screenWidth - spacing.screenPadding * 2 : cardWidth;
          return (
            <CategoryChip
              key={cat.id}
              id={cat.id}
              label={cat.label}
              description={cat.description}
              selected={selected.has(cat.id)}
              width={w}
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
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const ACCENT = '#C4AEDE';

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },
  scroll: {
    padding:       spacing.screenPadding,
    paddingTop:    64,
    paddingBottom: 60,
    gap:           20,
  },
  backBtn:   { marginBottom: 0 },
  backLabel: { fontFamily: fontFamily.sans, fontSize: 14, color: color.dim },

  heading: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   26,
    color:      color.paper,
    lineHeight: 34,
  },
  sub: {
    fontFamily:   fontFamily.sans,
    fontSize:     14,
    color:        color.dim,
    lineHeight:   21,
    marginBottom: 4,
  },

  grid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
  },

  chip: {
    backgroundColor: color.ink,
    borderRadius:    radius.input,
    padding:         18,
    borderWidth:     1.5,
    borderColor:     'transparent',
    minHeight:       120,
    gap:             8,
  },
  chipOn: {
    borderColor:     ACCENT,
    backgroundColor: 'rgba(196,174,222,0.10)',
  },

  // circle
  circle: {
    position:       'absolute',
    top:            14,
    right:          14,
    width:          20,
    height:         20,
    borderRadius:   10,
    borderWidth:    1.5,
    borderColor:    color.dim,
    alignItems:     'center',
    justifyContent: 'center',
  },
  circleOn: {
    borderColor:     ACCENT,
    backgroundColor: ACCENT,
  },
  circleDot: {
    color:      color.paper,
    fontSize:   11,
    lineHeight: 13,
    fontFamily: fontFamily.sansBold,
  },

  chipLabel: {
    fontFamily:    fontFamily.sansBold,
    fontSize:      font.labelSize,
    letterSpacing: font.labelLetterSpacing,
    textTransform: 'uppercase',
    color:         color.paper,
    paddingRight:  26,
  },
  chipLabelOn: { color: ACCENT },

  chipDesc: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
    lineHeight: 17,
  },

  actions: { gap: 12 },
});
