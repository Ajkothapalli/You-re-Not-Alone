// @ts-check
/**
 * Declare the microphone OPTIONAL hardware.
 *
 * Android implicitly requires `android.hardware.microphone` the moment a
 * manifest declares RECORD_AUDIO — no <uses-feature> entry needed. Play then
 * filters the app off every device without a mic. Uploading versionCode 31
 * surfaced this as "This release no longer supports 16 devices that were
 * supported in your previous release", and the half of that warning that
 * actually bites is the second half: users already on those devices stop
 * receiving updates entirely.
 *
 * That trade is wrong for this app. Dictation is an addition to writing, never
 * a precondition for it: lib/dictation.ts hides the mic when no on-device
 * recogniser exists, and the whole screen works from the keyboard
 * (__tests__/components/DictationMissing.test.tsx). A device with no
 * microphone can use soulyap completely.
 *
 * expo-speech-recognition's own plugin does not declare this — checked, there
 * is no reference to hardware.microphone anywhere in it — so it has to be
 * declared here.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const FEATURE = 'android.hardware.microphone';

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withOptionalMicrophone(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];

    const existing = manifest['uses-feature'].find(
      (f) => f?.$?.['android:name'] === FEATURE,
    );

    if (existing) {
      existing.$['android:required'] = 'false';
    } else {
      manifest['uses-feature'].push({
        $: { 'android:name': FEATURE, 'android:required': 'false' },
      });
    }

    return cfg;
  });
};
