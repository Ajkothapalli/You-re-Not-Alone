/**
 * The play control on a feed card carrying a voice confession.
 *
 * ── The text is never replaced ──────────────────────────────────────────────
 * This sits ALONGSIDE the transcript, which always renders. Someone deaf or
 * hard of hearing, someone with no headphones on a bus, someone whose battery
 * is dying — all of them get the whole confession. Audio is an addition to the
 * card, never the card itself.
 *
 * ── Nothing autoplays ───────────────────────────────────────────────────────
 * The URL is not even fetched until the tap. Prefetching would mean the server
 * handing out signed URLs for recordings nobody asked to hear, and the first
 * frame of audio sitting ready to play by accident.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAudioPlayer, useAudioPlayerStatus, AUDIO_AVAILABLE } from '@/lib/audioModule';
import {
  claimPlayback, getAudioUrl, releasePlayback, subscribePlayback,
} from '@/lib/audioPlayback';
import { formatDuration } from '@/lib/voiceRecorder';
import { useThemeColors } from '@/theme/ThemeProvider';
import { type ColorSet, fontFamily } from '@/theme/tokens';

export interface VoicePlayButtonProps {
  confessionId: string;
  durationMs:   number;
}

export default function VoicePlayButton({ confessionId, durationMs }: VoicePlayButtonProps) {
  const color  = useThemeColors();
  const styles = createStyles(color);

  const [url,     setUrl]     = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed,  setFailed]  = useState(false);
  const [mine,    setMine]    = useState(false);

  const player = useAudioPlayer(url ? { uri: url } : null);
  const status = useAudioPlayerStatus(player);
  const playerRef = useRef(player);
  playerRef.current = player;

  // The registry is the source of truth for who is playing, so this card
  // renders from it rather than from its own boolean — otherwise two cards can
  // both believe they are playing.
  useEffect(() => subscribePlayback((id) => setMine(id === confessionId)), [confessionId]);

  const hardStop = useCallback(() => {
    try { playerRef.current?.pause(); } catch {}
  }, []);

  useEffect(() => {
    if (status?.didJustFinish) {
      try { playerRef.current?.seekTo(0); } catch {}
      releasePlayback(confessionId);
    }
  }, [status?.didJustFinish, confessionId]);

  // Unmount = scrolled far enough away to be recycled. Stop, and release the
  // claim so the next card is not blocked by a card that no longer exists.
  useEffect(() => () => {
    hardStop();
    releasePlayback(confessionId);
  }, [confessionId, hardStop]);

  async function toggle() {
    Haptics.selectionAsync().catch(() => {});

    if (mine) {
      hardStop();
      releasePlayback(confessionId);
      return;
    }

    setFailed(false);
    let src = url;
    if (!src) {
      setLoading(true);
      src = await getAudioUrl(confessionId);
      setLoading(false);
      if (!src) { setFailed(true); return; }
      setUrl(src);
      // The player picks the source up on the next render; claim now so any
      // other card stops immediately rather than after the URL resolves.
    }

    claimPlayback(confessionId, hardStop);
    try {
      playerRef.current?.seekTo(0);
      playerRef.current?.play();
    } catch {
      setFailed(true);
      releasePlayback(confessionId);
    }
  }

  // Once the source lands, start — but only if this card still holds the claim.
  useEffect(() => {
    if (mine && url) {
      try { playerRef.current?.play(); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Nothing to play on a binary that predates expo-audio (an OTA reaches
  // those). A dead control is worse than none: the transcript above is the
  // whole confession either way.
  if (!AUDIO_AVAILABLE) return null;

  return (
    <Pressable
      onPress={toggle}
      hitSlop={8}
      style={styles.row}
      accessibilityRole="button"
      accessibilityState={{ selected: mine }}
      accessibilityLabel={
        mine ? 'Pause this recording'
             : `Play this recording, ${formatDuration(durationMs)}`
      }
      // Says outright that the text is complete without it — a screen-reader
      // user should not be left wondering whether audio holds something extra.
      accessibilityHint="The full confession is written above."
      testID={`voice-play-${confessionId}`}
    >
      <View style={styles.icon}>
        {loading
          ? <ActivityIndicator size="small" color={color.dim} />
          : <Icon name={mine ? 'pause' : 'play'} size={15} />}
      </View>
      <Text style={styles.label}>
        {failed ? 'Audio unavailable' : formatDuration(durationMs)}
      </Text>
    </Pressable>
  );
}

function createStyles(color: ColorSet) {
  return StyleSheet.create({
    row: {
      flexDirection:     'row',
      alignItems:        'center',
      gap:               8,
      alignSelf:         'flex-start',
      paddingVertical:   6,
      paddingHorizontal: 10,
      borderRadius:      999,
      borderWidth:       1.5,
      borderColor:       color.line,
    },
    icon: {
      width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    },
    glyph: { fontSize: 11, color: color.paper },
    label: {
      fontFamily:  fontFamily.sans,
      fontSize:    12,
      color:       color.dim,
      fontVariant: ['tabular-nums'],
    },
  });
}
