/**
 * What happens on a binary that predates expo-audio.
 *
 * This is not hypothetical. runtimeVersion is {policy: 'appVersion'} and
 * `version` has been 1.0.0 since before voice shipped, so every Android build
 * from versionCode 32 onward shares one runtime — and an OTA is delivered to
 * all of them. expo-audio was added in 5924d5e, AFTER the Play release, so the
 * binary real users are running does not contain it.
 *
 * A static import of a missing native module throws at MODULE SCOPE.
 * VoicePlayButton is rendered by ReadCard, which is the feed, which is the
 * first screen after sign-in. Unguarded, an icon-only OTA would have white-
 * screened the read surface for every store user.
 *
 * The same failure took down the write screen on 2026-09-23 with
 * "Cannot find native module 'ExpoSpeechRecognition'". This file exists so it
 * cannot happen a second time with a different module.
 */

// Exactly what an older binary does: requiring it throws.
jest.mock('expo-audio', () => {
  throw new Error("Cannot find native module 'ExpoAudio'");
});

jest.mock('@/theme/ThemeProvider', () => ({
  useThemeColors: () => ({
    ink: '#141414', paper: '#F5F5F5', dim: '#666666',
    line: '#2A2A2A', border: '#FFFFFF', accent: '#FFE500',
  }),
  useTheme: () => ({ isDark: true }),
}));

import React from 'react';
import { render } from '@testing-library/react-native';

describe('expo-audio missing from the binary', () => {
  it('lib/audioModule loads instead of throwing at import time', () => {
    // The whole point of the guard: importing must not be fatal.
    const m = require('@/lib/audioModule');
    expect(m.AUDIO_AVAILABLE).toBe(false);
  });

  it('its hook stand-ins are callable and return null', () => {
    // They have to stay hook-SHAPED — the branch is decided once at module
    // load, so the hook count never changes between renders.
    const m = require('@/lib/audioModule');
    expect(m.useAudioPlayer({ uri: 'x' })).toBeNull();
    expect(m.useAudioPlayerStatus(null)).toBeNull();
  });

  it('VoicePlayButton renders nothing rather than crashing the feed', async () => {
    const VoicePlayButton = require('@/components/VoicePlayButton').default;
    const { toJSON } = await render(
      <VoicePlayButton confessionId="c1" durationMs={4200} />,
    );
    // Null, not a dead control: the transcript above is the whole confession
    // either way, and a play button that does nothing is worse than none.
    expect(toJSON()).toBeNull();
  });

  it('no source file imports expo-audio directly', () => {
    // One guarded require, one place to get this wrong.
    const fs = require('fs'), path = require('path');
    const root = path.join(__dirname, '..', '..');
    const walk = (d: string): string[] => {
      const full = path.join(root, d);
      if (!fs.existsSync(full)) return [];
      return fs.readdirSync(full, { withFileTypes: true }).flatMap((e: any) =>
        e.isDirectory() ? walk(path.join(d, e.name))
        : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []);
    };
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')]
      .filter((f) => f.replace(/\\/g, '/') !== 'lib/audioModule.ts')
      .filter((f) => /from\s+'expo-audio'/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
