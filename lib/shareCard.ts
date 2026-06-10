import * as Sharing from 'expo-sharing';
import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Rasterizes the off-screen StoryCard View to a PNG and opens the OS share sheet.
 *
 * On a 3× device (modern iPhones) the 360×640 logical canvas produces
 * a 1080×1920 PNG at native resolution — story-friendly dimensions.
 *
 * useRenderInContext: true improves gradient fidelity on Android.
 */
export async function shareConfessionCard(storyRef: RefObject<View | null>): Promise<void> {
  if (!storyRef.current) throw new Error('Story card ref is not attached');

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
