/**
 * Rasterizes the off-screen StoryCard to a PNG and hands it to the share sheet
 * with a TAPPABLE link beside it.
 *
 * ── Why two share modules ───────────────────────────────────────────────────
 * `expo-sharing` can only send a file. The URL was therefore printed inside the
 * image, where nobody can tap it — a person reading the card had to retype
 * `soulyap.me/s?c=read` by hand, which nobody does. `react-native-share` can
 * carry a message alongside the file, so the link becomes a link.
 *
 * Both are kept, and that is deliberate rather than indecisive: `react-native-
 * share` is a NATIVE module absent from every binary shipped so far. An OTA
 * update reaches those installs, and an unguarded `import` of a missing native
 * module is a crash on the first Share tap. So the import is guarded and
 * expo-sharing remains the fallback — those installs keep exactly today's
 * behaviour (image only, URL printed in the card) and the tappable link lights
 * up when a build carrying the module reaches the device. Nothing regresses,
 * nothing crashes, and the feature does not need a store release to be safe.
 *
 * ── What the link carries ───────────────────────────────────────────────────
 * The bucket and, at most, a random per-share token — see lib/shareLink.ts for
 * why nothing else may ever go in it. The token is fetched with a short
 * timeout and every failure is silent: a share must never fail, or wait, for
 * attribution. It is never logged and never passed to analytics.
 *
 * Audio is never attached, in either path (CLAUDE.md #3): a recognisable voice
 * on a card that can be forwarded off-platform is not something a deletion can
 * ever take back.
 */

import * as Sharing from 'expo-sharing';
import { type RefObject } from 'react';
import { type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import type { ShareSource } from '@/lib/shareLink';
import { createShareToken } from '@/lib/api';
import { buildShareLink, shareMessage } from '@/lib/shareLink';

export type { ShareSource };

export const VALID_SHARE_SOURCES: ShareSource[] = ['match', 'rtue', 'read', 'question', 'invite'];

/**
 * Guarded require, not an import: this module is missing from binaries built
 * before Phase A, and an OTA reaches them. `require` inside try/catch is the
 * only form that can fail softly — a static import is resolved before any of
 * this file runs.
 */
type ShareLike = { open: (opts: Record<string, unknown>) => Promise<unknown> };
let nativeShare: ShareLike | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('react-native-share');
  const candidate = mod?.default ?? mod;
  nativeShare = typeof candidate?.open === 'function' ? candidate : null;
} catch {
  nativeShare = null;
}

/** True when the sheet on this device can carry a tappable link. */
export const LINK_SHARE_AVAILABLE = nativeShare !== null;

/** Same guard, same reason: expo-clipboard is native and equally absent. */
type ClipboardLike = { setStringAsync: (s: string) => Promise<unknown> };
let clipboard: ClipboardLike | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('expo-clipboard');
  clipboard = typeof mod?.setStringAsync === 'function' ? mod : null;
} catch {
  clipboard = null;
}

export interface ShareResult {
  /** The link that went out — bucket-only if no token was minted. */
  link:         string;
  /** Whether the reader gets a tappable link or only the printed one. */
  tappableLink: boolean;
  /** Whether the link also reached the clipboard, for the Stories paste. */
  linkCopied:   boolean;
  /** True only when a target app was demonstrably chosen. See didChooseTarget. */
  choseTarget?: boolean;
}

/**
 * Instagram Stories — and only Stories — discards the message a share carries,
 * so the link that works everywhere else arrives nowhere. The clipboard is the
 * one channel Stories leaves open: the writer pastes it into a link sticker.
 *
 * The sheet never reports WHICH app was picked, so this runs on every share
 * rather than on an Instagram branch that cannot be detected. That does replace
 * whatever the writer had copied, which is why the caller is told it happened
 * and can say so — a clipboard that changes silently is the annoying version.
 */
async function copyLink(link: string): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.setStringAsync(link);
    return true;
  } catch {
    return false; // Never cost someone their share over a clipboard write.
  }
}

export interface PreparedShare {
  /** file:// path to the captured PNG. */
  uri:        string;
  link:       string;
  linkCopied: boolean;
}

/**
 * Everything that must happen BEFORE the sheet can open: capture the still
 * card, mint the token, build the link, copy it.
 *
 * Split out from opening the sheet so the release animation and this work can
 * run at the same time. The animation is ~2.6s of screen time that would
 * otherwise be dead waiting; starting the capture the instant Share is tapped
 * means the sheet is ready by the time the quotes have lifted away, and a
 * writer who taps through the animation does not then wait again.
 */
export async function prepareShare(
  storyRef: RefObject<View | null>,
  source: ShareSource,
): Promise<PreparedShare> {
  if (!storyRef.current) throw new Error('Story card ref is not attached');

  // The bucket is the only caller-supplied value that reaches the URL, so it is
  // checked against the allowlist rather than trusted — an id smuggled in here
  // would end up in a link that travels beside the confession it identifies.
  if (!VALID_SHARE_SOURCES.includes(source)) {
    throw new Error(`Invalid share source: ${source}`);
  }

  const uri = await captureRef(storyRef, {
    format:                   'png',
    quality:                  1,
    result:                   'tmpfile',
    snapshotContentContainer: false,
    useRenderInContext:       true,
  } as Parameters<typeof captureRef>[1]);

  // Minted AFTER the capture: if the capture throws there is nothing to share,
  // and a token burnt on a share that never happened still counts against the
  // writer's daily cap.
  const token = await createShareToken(source).catch(() => null);
  const link  = buildShareLink(source, token);
  const linkCopied = await copyLink(link);

  return { uri, link, linkCopied };
}

/**
 * Opens the system share sheet on an already-prepared card.
 *
 * The result says whether a target app was actually chosen — see
 * didChooseTarget, which is the only thing allowed to decide that.
 */
export async function openShareSheet(prepared: PreparedShare): Promise<ShareResult> {
  const { uri, link, linkCopied } = prepared;

  if (nativeShare) {
    const raw = await nativeShare.open({
      url:          uri,
      type:         'image/png',
      message:      shareMessage(link),
      title:        'Share your moment',
      // A writer backing out of the share sheet is an ordinary choice, not an
      // error to apologise for with a dialog.
      failOnCancel: false,
    });
    return {
      link, tappableLink: true, linkCopied,
      choseTarget: didChooseTarget(raw),
    };
  }

  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) throw new Error('Sharing is not available on this device');

  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your moment' });
  // expo-sharing reports nothing about what the user did, so this path can
  // never claim a target was chosen.
  return { link, tappableLink: false, linkCopied, choseTarget: false };
}

/**
 * Did the user actually pick an app, or did they dismiss the chooser?
 *
 * Read off react-native-share v12's own source rather than guessed, because
 * the after-screen celebration hangs on it and celebrating a share that never
 * happened is worse than celebrating nothing.
 *
 *   Android (RNShareImpl + social/TargetChosenReceiver):
 *     - A chooser is launched via Intent.createChooser(..., intentSender) on
 *       API >= 22, so when a target is picked the system broadcasts to
 *       TargetChosenReceiver.onReceive, which resolves
 *       { success: true, message: <ComponentName flattened, e.g.
 *       "com.whatsapp/.ContactPicker"> }.
 *     - Dismissing resolves via onActivityResult(RESULT_CANCELED) as
 *       { success: false, message: "CANCELED" }.
 *     - When EXTRA_CHOSEN_COMPONENT is absent the message is the bare "OK",
 *       which does NOT prove a target was chosen.
 *   iOS (RNShare.mm): UIActivityViewController's completionWithItemsHandler
 *     resolves { success: completed, message: activityType ?? "" }.
 *
 * So a chosen target is: success true AND a message that NAMES something. The
 * bare "OK" and "CANCELED" are both treated as "we do not know", which is the
 * conservative reading — nothing is shown rather than something untrue.
 */
export function didChooseTarget(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as { success?: unknown; message?: unknown; dismissedAction?: unknown };
  if (r.dismissedAction === true) return false;
  if (r.success !== true) return false;
  if (typeof r.message !== 'string') return false;
  const m = r.message.trim();
  return m !== '' && m !== 'OK' && m !== 'CANCELED';
}

/**
 * Capture and share in one call — the pre-Q1 entry point, now the composition
 * of the two halves. Kept because the two-step form only helps a caller that
 * has an animation to overlap with.
 */
export async function shareConfessionCard(
  storyRef: RefObject<View | null>,
  source: ShareSource,
): Promise<ShareResult> {
  return openShareSheet(await prepareShare(storyRef, source));
}
