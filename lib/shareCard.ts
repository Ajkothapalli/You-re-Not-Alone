import * as Sharing from 'expo-sharing';
import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

/**
 * Rasterizes the given View ref to a PNG and opens the OS share sheet.
 * Used to export the ConfessionCard as a story-friendly image.
 */
export async function shareConfessionCard(cardRef: RefObject<View | null>): Promise<void> {
  if (!cardRef.current) throw new Error('Card ref is not attached');

  const uri = await captureRef(cardRef, {
    format:  'png',
    quality: 1,
    result:  'tmpfile',
  });

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share this feeling' });
}
