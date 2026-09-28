/**
 * The share moment: did it actually go out, which look opens next, and what
 * the after screen is allowed to say.
 *
 * didChooseTarget gets the most attention because it is the only thing
 * standing between "your words are travelling" and telling someone that after
 * they backed out of the chooser. The shapes below are taken from
 * react-native-share v12's own source, not invented:
 *
 *   android/src/main/java/cl/json/social/TargetChosenReceiver.java
 *   android/src/main/java/cl/json/RNShareImpl.java
 *   ios/RNShare.mm
 */

jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(), isAvailableAsync: jest.fn() }));
jest.mock('@/lib/api', () => ({ createShareToken: jest.fn() }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { didChooseTarget } from '@/lib/shareCard';
import { openingLook, rememberLook } from '@/lib/shareLookStore';
import { LOOK_IDS } from '@/lib/shareLooks';
import {
  afterHeading, afterSubline, afterPrimaryLabel,
  AFTER_HEADINGS_OTHERS, AFTER_HEADINGS_OWN,
} from '@/lib/shareAfterCopy';

beforeEach(async () => { await AsyncStorage.clear(); });

// ─── Did a target actually get chosen? ───────────────────────────────────────

describe('a target was chosen', () => {
  it('Android: the broadcast names the component', () => {
    // TargetChosenReceiver.onReceive puts EXTRA_CHOSEN_COMPONENT, flattened.
    expect(didChooseTarget({ success: true, message: 'com.whatsapp/.ContactPicker' })).toBe(true);
    expect(didChooseTarget({ success: true, message: 'org.telegram.messenger/.LaunchActivity' })).toBe(true);
  });

  it('iOS: completionWithItemsHandler reports an activity type', () => {
    expect(didChooseTarget({ success: true, message: 'com.apple.UIKit.activity.PostToFacebook' })).toBe(true);
  });
});

describe('a target was NOT chosen', () => {
  it('Android: the chooser was dismissed', () => {
    // onActivityResult(RESULT_CANCELED) → success false, message "CANCELED".
    expect(didChooseTarget({ success: false, message: 'CANCELED' })).toBe(false);
  });

  it('the JS layer wrapped it as a dismissal', () => {
    // index.js adds dismissedAction when !success and failOnCancel is false.
    expect(didChooseTarget({ dismissedAction: true, success: false, message: 'CANCELED' })).toBe(false);
    // dismissedAction wins even if something else claims success.
    expect(didChooseTarget({ dismissedAction: true, success: true, message: 'com.whatsapp/.X' })).toBe(false);
  });

  it('iOS: the sheet was cancelled', () => {
    expect(didChooseTarget({ success: false, message: '' })).toBe(false);
  });

  it('the bare "OK" does not prove anything', () => {
    // Android sets this when EXTRA_CHOSEN_COMPONENT is absent, and on the
    // intentSender==null path. Neither says an app was picked, so the after
    // screen must not play — showing nothing beats claiming a share happened.
    expect(didChooseTarget({ success: true, message: 'OK' })).toBe(false);
  });

  it('is false for anything malformed rather than throwing', () => {
    for (const bad of [
      null, undefined, 0, '', 'true', [], {},
      { success: true },
      { success: true, message: null },
      { success: true, message: '   ' },
      { success: 'true', message: 'com.whatsapp/.X' },
      { message: 'com.whatsapp/.X' },
    ]) {
      expect(didChooseTarget(bad)).toBe(false);
    }
  });
});

// ─── Look rotation persists ──────────────────────────────────────────────────

describe('each share opens on the next look', () => {
  it('starts at the first look on a fresh install', async () => {
    expect(await openingLook()).toBe('classic');
  });

  it('advances after a share', async () => {
    await rememberLook('classic');
    expect(await openingLook()).toBe('midnight');
    await rememberLook('midnight');
    expect(await openingLook()).toBe('sticker');
  });

  it('wraps at the end', async () => {
    await rememberLook('split');
    expect(await openingLook()).toBe('classic');
  });

  it('persists across a reload — the point of storing it at all', async () => {
    await rememberLook('hush');
    // A fresh read with no in-memory state.
    expect(await openingLook()).toBe('split');
  });

  it('survives a corrupted stored value', async () => {
    await AsyncStorage.setItem('@yana/share_look_index', 'not-a-number');
    expect(LOOK_IDS).toContain(await openingLook());
  });

  it('never throws when storage is unavailable', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('nope'));
    await expect(openingLook()).resolves.toBe('classic');
    spy.mockRestore();

    const spy2 = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('nope'));
    await expect(rememberLook('hush')).resolves.toBeUndefined();
    spy2.mockRestore();
  });
});

// ─── After-screen copy ───────────────────────────────────────────────────────

describe('the after screen rotates its heading', () => {
  it('cycles the four for someone else', () => {
    expect(AFTER_HEADINGS_OTHERS).toHaveLength(4);
    for (let i = 0; i < 4; i++) expect(afterHeading(false, i)).toBe(AFTER_HEADINGS_OTHERS[i]);
    expect(afterHeading(false, 4)).toBe(AFTER_HEADINGS_OTHERS[0]);
  });

  it('cycles the three for your own', () => {
    expect(AFTER_HEADINGS_OWN).toHaveLength(3);
    for (let i = 0; i < 3; i++) expect(afterHeading(true, i)).toBe(AFTER_HEADINGS_OWN[i]);
    expect(afterHeading(true, 3)).toBe(AFTER_HEADINGS_OWN[0]);
  });

  it('never returns undefined for a strange variant', () => {
    for (const n of [-1, -7, 0, 99, NaN, 1.5]) {
      expect(typeof afterHeading(false, n)).toBe('string');
      expect(afterHeading(false, n).length).toBeGreaterThan(0);
    }
  });

  it('two consecutive shares do not read the same', () => {
    for (let i = 0; i < 10; i++) {
      expect(afterHeading(false, i)).not.toBe(afterHeading(false, i + 1));
    }
  });
});

describe('the subline is a claim the product has to keep', () => {
  it('promises only the words travel', () => {
    expect(afterSubline(false)).toBe('Only the words travel. Never who wrote them.');
    expect(afterSubline(true)).toBe('Only you know it was you.');
  });

  it('is backed by the card and the link carrying no identity', () => {
    // If either of these ever stops being true, the sentence above becomes a
    // lie told at the most trusting moment in the app.
    const fs = require('fs'), path = require('path');
    const root = path.join(__dirname, '..', '..');
    const card = fs.readFileSync(path.join(root, 'components', 'share', 'QuotedCard.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const f of ['account_id', 'author_token', 'persona', 'created_at']) {
      expect(card).not.toContain(f);
    }
    const link = fs.readFileSync(path.join(root, 'lib', 'shareLink.ts'), 'utf8');
    expect(link).toContain('c=${encodeURIComponent(source)}');
    expect(link).toContain('&t=${token}');
  });
});

describe('the primary action is always writing', () => {
  it('names it for each case', () => {
    expect(afterPrimaryLabel(false)).toBe('Say yours');
    expect(afterPrimaryLabel(true)).toBe('Write something new');
  });
});
