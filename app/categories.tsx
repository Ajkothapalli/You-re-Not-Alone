/**
 * Category picker — shown once after account creation (post-DOB).
 * Also reachable from profile to edit preferences.
 *
 * Save is non-blocking: if reader_preferences doesn't exist yet (migration
 * pending) we log the failure and route through anyway.
 */

import { CATEGORIES, type CategoryId } from '@/lib/categories';
import { CategoryBadge } from '@/components/CategoryGlyph';
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
  id:          CategoryId;
  label:       string;
  hint:        string;
  description: string;
  catColor:    string;
  selected:    boolean;
  width:       number;
  onToggle:    (id: CategoryId) => void;
};

function CategoryChip({ id, label, hint, description, catColor, selected, width, onToggle }: ChipProps) {
  const dotScale  = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const cardScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(dotScale, {
      toValue:         selected ? 1 : 0,
      useNativeDriver: true,
      tension:         220,
      friction:        22,
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
      style={{ width, transform: [{ scale: cardScale }] }}
      accessible={false}
      importantForAccessibility="no"
    >
      <Pressable
        onPress={() => onToggle(id)}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.chip,
          selected && { borderColor: catColor, backgroundColor: catColor + '1A' },
        ]}
        accessible={true}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`${label}. ${description}`}
      >
        {/* Decorative check — state conveyed via accessibilityState */}
        <View
          style={[
            styles.circle,
            selected && { borderColor: catColor, backgroundColor: catColor },
          ]}
          accessibilityElementsHidden={true}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.Text style={[styles.circleDot, { transform: [{ scale: dotScale }] }]}>✓</Animated.Text>
        </View>

        <CategoryBadge id={id} size={44} />

        <Text style={[styles.chipLabel, selected && { color: catColor }]}>{label}</Text>
        <Text style={styles.chipDesc} numberOfLines={2}>{hint}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function CategoriesScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const params                 = useLocalSearchParams<{ mode?: string }>();
  const isEdit                 = params.mode === 'edit';

  const cardWidth = (screenWidth - spacing.screenPadding * 2 - 10) / 2;

  const [selected,     setSelected]     = useState<Set<CategoryId>>(new Set());
  const [saving,       setSaving]       = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    getReaderPreferences()
      .then(prefs => {
        if (prefs) setSelected(new Set(prefs.categories as CategoryId[]));
      })
      .catch(() => {})
      .finally(() => setLoadingPrefs(false));
  }, []);

  function toggle(id: CategoryId) {
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
        <View style={styles.closeRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeLabel}>Done</Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.heading} accessibilityRole="header">
        {isEdit ? 'reading categories' : 'what do you want to read?'}
      </Text>
      <Text style={styles.sub}>
        {isEdit
          ? 'Change what kinds of confessions appear in Explore.'
          : "Choose what you'd like to carry with you. You can change this anytime."}
      </Text>

      <View style={styles.grid}>
        {CATEGORIES.map((cat, idx) => {
          const isLastAlone = CATEGORIES.length % 2 !== 0 && idx === CATEGORIES.length - 1;
          const w = isLastAlone ? screenWidth - spacing.screenPadding * 2 : cardWidth;
          return (
            <CategoryChip
              key={cat.id}
              id={cat.id}
              label={cat.label}
              hint={cat.hint}
              description={cat.description}
              catColor={cat.color}
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

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: color.bg,
  },
  scroll: {
    padding:       spacing.screenPadding,
    paddingTop:    20,
    paddingBottom: 60,
    gap:           20,
  },
  closeRow: {
    alignItems: 'flex-end',
  },
  closeLabel: { fontFamily: fontFamily.sans, fontSize: 16, color: color.dim },

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
    minHeight:       140,
    gap:             8,
  },

  // Check circle
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

  chipDesc: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
    lineHeight: 17,
  },

  actions: { gap: 12 },
});
