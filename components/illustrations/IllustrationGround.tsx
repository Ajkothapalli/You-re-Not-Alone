/**
 * IllustrationGround — the paper a scene is printed on.
 *
 * Every scene in this system draws in PRINT colours that deliberately never
 * invert: ILL_COLOR.ink is #1A1A1A in both themes (theme/illustration.ts says
 * so explicitly — "the card chrome follows the app theme; the drawing does
 * not"). That contract only holds if the drawing has paper under it.
 *
 * It did not. IllustrationCard exists to supply that ground and was wired up
 * nowhere: all six render sites drew scenes bare, straight onto whatever the
 * screen's background happened to be. In light that background is #F7F4EF or
 * #FFFFFF and the ink reads fine, which is why this went unseen. In dark it is
 * #0A0A0A / #141414, and #1A1A1A line work on it is all but invisible —
 * reported 2026-09-18 as illustrations "not adapting" to dark mode.
 *
 * This is the ground without the chrome. IllustrationCard adds a border and a
 * hard offset shadow, which would redesign five screens that never had a framed
 * illustration; this adds only what legibility requires. Use IllustrationCard
 * where the neo-brutal frame is actually wanted.
 *
 * In light mode on the app background (#F7F4EF) this is invisible by
 * construction — the ground and the background are the same colour — so the
 * fix costs nothing where nothing was broken.
 */

import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { ILL_COLOR } from '@/theme/illustration';
import { radius } from '@/theme/tokens';

export function IllustrationGround({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?:   ViewStyle;
  testID?:  string;
}) {
  return (
    <View style={[styles.ground, style]} testID={testID ?? 'IllustrationGround'}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ground: {
    backgroundColor: ILL_COLOR.paper,
    borderRadius:    radius.card,
    alignItems:      'center',
    justifyContent:  'center',
    overflow:        'hidden',
  },
});
