import * as Sharing from 'expo-sharing';
import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { ShareSource } from '@/components/StoryCard';

export type { ShareSource };

export const VALID_SHARE_SOURCES: ShareSource[] = ['match', 'rtue', 'read'];

/**
 * Rasterizes the off-screen StoryCard View to a PNG and opens the OS share sheet.
 *
 * The source bucket is baked into the card's footer URL (soulyap.me/s?c=<source>),
 * so the trackable link travels with the image on every platform.
 *
 * On a 3× device the 360×640 logical canvas produces a 1080×1920 PNG — story-friendly.
 */
export async function shareConfessionCard(
  storyRef: RefObject<View | null>,
  source: ShareSource,
): Promise<void> {
  if (!storyRef.current) throw new Error('Story card ref is not attached');

  // Validate that source is only the non-identifying bucket — no ids or tokens.
  if (!VALID_SHARE_SOURCES.includes(source)) {
    throw new Error(`Invalid share source: ${source}`);
  }

  const uri = await captureRef(storyRef, {
    format:                   'png',
    quality:                  1,
    result:                   'tmpfile',
    snapshotContentContainer: false,
    useRenderInContext:        true,
  } as Parameters<typeof captureRef>[1]);

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your moment' });
}
