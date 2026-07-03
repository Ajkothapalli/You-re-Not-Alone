import { router } from 'expo-router';
import React from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fontFamily } from '@/theme/tokens';

const MAX_HEIGHT = Dimensions.get('window').height * 0.92;

interface Props {
  children:  React.ReactNode;
  title?:    string;
  onClose?:  () => void;
}

export default function BottomSheet({ children, title, onClose }: Props) {
  const { bottom } = useSafeAreaInsets();

  function close() {
    onClose ? onClose() : router.back();
  }

  return (
    <View style={styles.root}>
      {/* Scrim — the space above the sheet; tap to dismiss */}
      <Pressable style={styles.scrim} onPress={close} accessibilityRole="button" accessibilityLabel="Close" />

      {/* Sheet card */}
      <View style={[styles.sheet, { paddingBottom: Math.max(bottom, 20), maxHeight: MAX_HEIGHT }]}>
        {/* Drag handle */}
        <View style={styles.handleRow} pointerEvents="none">
          <View style={styles.handle} />
        </View>

        {title ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={close} hitSlop={12} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.closeIcon}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent:  'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    backgroundColor:      '#17131F',
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    borderWidth:          1,
    borderColor:          'rgba(243,238,232,0.08)',
    borderBottomWidth:    0,
    overflow:             'hidden',
  },
  handleRow: {
    alignItems:    'center',
    paddingTop:    12,
    paddingBottom: 4,
  },
  handle: {
    width:           36,
    height:          4,
    borderRadius:    2,
    backgroundColor: 'rgba(243,238,232,0.18)',
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 24,
    paddingVertical:   16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(243,238,232,0.09)',
  },
  title: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   22,
    color:      '#F3EEE8',
  },
  closeBtn: {
    padding: 4,
  },
  closeIcon: {
    fontFamily: fontFamily.sans,
    fontSize:   16,
    color:      '#A29CAA',
  },
});
