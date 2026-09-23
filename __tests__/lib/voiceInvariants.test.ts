/**
 * The invariants raw voice puts under strain.
 *
 * Voice is unmodulated by owner decision (2026-09-23), which knowingly breaks
 * "no user can ever tie a confession to a person". Everything else that
 * protected anonymity still has to hold, and these are source-level guards
 * because most of them are about what does NOT appear — an object key in a
 * payload, an audio field on a share card — and absence is not something a
 * render test notices.
 */

import fs   from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

describe('the audio object key never reaches a client', () => {
  it('confessions_public exposes duration, never the key', () => {
    const sql = read('supabase', 'migrations', '20260923000001_voice_confessions.sql');
    const view = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW confessions_public'));
    const select = view.slice(0, view.indexOf('FROM'));
    expect(select).toMatch(/audio_duration_ms/);
    expect(select).not.toMatch(/audio_key/);
  });

  it('audio_key is revoked at column level, like account_id', () => {
    const sql = read('supabase', 'migrations', '20260923000001_voice_confessions.sql');
    expect(sql).toMatch(/REVOKE SELECT \(audio_key\) ON confessions FROM anon, authenticated/);
  });

  it('the feed RPC selects duration but not the key', () => {
    const sql = read('supabase', 'migrations', '20260923000003_feed_audio_duration.sql');
    expect(sql).toMatch(/audio_duration_ms/);
    // The only mention of audio_key may be the comment explaining its absence.
    const codeLines = sql.split('\n').filter((l) => !l.trim().startsWith('--'));
    expect(codeLines.join('\n')).not.toMatch(/audio_key/);
  });

  it('the feed payload carries duration only', () => {
    const src = read('supabase', 'functions', 'recommend-confessions', 'index.ts');
    const mapBlock = src.slice(src.indexOf('const result = diverse.map'));
    expect(mapBlock).toMatch(/audioDurationMs/);
    expect(mapBlock).not.toMatch(/audio_key|audioKey/);
  });

  it('the Recommendation type has no key field', () => {
    const src = read('lib', 'api.ts');
    const iface = src.slice(src.indexOf('export interface Recommendation'));
    const body  = iface.slice(0, iface.indexOf('}'));
    expect(body).not.toMatch(/audioKey|audio_key|signedUrl|audioUrl/);
  });

  it('get-audio-url returns a signed url and never the key', () => {
    const src = read('supabase', 'functions', 'get-audio-url', 'index.ts');
    // The return statement itself.
    const ret = src.slice(src.indexOf('return json({ url:'));
    expect(ret).toMatch(/signedUrl/);
    expect(ret).not.toMatch(/audio_key/);
  });
});

describe('the object key is not derivable from who wrote it', () => {
  it('create-audio-upload uses a random uuid', () => {
    const src = read('supabase', 'functions', 'create-audio-upload', 'index.ts');
    expect(src).toMatch(/crypto\.randomUUID\(\)/);
    // A key built from any of these would let one URL be turned into a map of
    // somebody's recordings.
    const keyLine = src.split('\n').find((l) => l.includes('const key ='))!;
    expect(keyLine).not.toMatch(/account_id|user\.id|author|confessionId/);
  });
});

describe('share cards never carry audio', () => {
  it('lib/shareCard.ts references no audio at all', () => {
    // A recognisable voice must not leave the app through a share — the one
    // route out of the product that the recipient controls entirely.
    const src = read('lib', 'shareCard.ts');
    expect(src).not.toMatch(/audio|mp3|recording|signedUrl/i);
  });

  it('StoryCard takes no audio props', () => {
    const src = read('components', 'StoryCard.tsx');
    expect(src).not.toMatch(/audioKey|audioUrl|audioDurationMs|\.mp3/i);
  });
});

describe('deletion erases the recording, not just the row', () => {
  it('both DSAR functions return the keys they removed', () => {
    const sql = read('supabase', 'migrations', '20260923000002_voice_deletion.sql');
    expect(sql).toMatch(/dsar_delete_author_data[\s\S]*?deleted_audio_keys\s+text\[\]/);
    expect(sql).toMatch(/dsar_anonymize_author[\s\S]*?deleted_audio_keys\s+text\[\]/);
  });

  it('delete-account actually removes the objects', () => {
    const src = read('supabase', 'functions', 'delete-account', 'index.ts');
    expect(src).toMatch(/storage\.from\('confession-audio'\)\.remove/);
    // Both paths, not just erase.
    const calls = src.match(/eraseAudioObjects\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);  // definition + erase + anonymize
  });

  it('anonymize strips the audio — a raw voice cannot be anonymised', () => {
    const sql = read('supabase', 'migrations', '20260923000002_voice_deletion.sql');
    const fn  = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION dsar_anonymize_author'));
    expect(fn).toMatch(/audio_key\s*=\s*NULL/);
    expect(fn).toMatch(/audio_duration_ms\s*=\s*NULL/);
  });

  it('deleting a single confession erases its recording', () => {
    const src = read('supabase', 'functions', 'manage-confession', 'index.ts');
    expect(src).toMatch(/take_confession_audio_key/);
    expect(src).toMatch(/storage\.from\('confession-audio'\)\.remove/);
  });

  it('there is a way to find recordings that outlived their confession', () => {
    const sql = read('supabase', 'migrations', '20260923000001_voice_confessions.sql');
    expect(sql).toMatch(/CREATE OR REPLACE VIEW orphaned_confession_audio/);
  });
});

describe('the bucket is private', () => {
  it('is created with public = false and an mp3-only mime allowlist', () => {
    const sql = read('supabase', 'migrations', '20260923000001_voice_confessions.sql');
    const insert = sql.slice(sql.indexOf('INSERT INTO storage.buckets'));
    expect(insert).toMatch(/false/);
    expect(insert).toMatch(/audio\/mpeg/);
  });

  it('playback urls expire', () => {
    const src = read('supabase', 'functions', 'get-audio-url', 'index.ts');
    expect(src).toMatch(/createSignedUrl\(/);
    expect(src).toMatch(/PLAYBACK_TTL_SECS/);
  });
});

describe('consent', () => {
  it('the wording is exactly what the owner decision requires', () => {
    // Not paraphrasable. This sentence is the entire mitigation for a decision
    // that breaks the app's central anonymity promise.
    const { VOICE_CONSENT_LINE } = require('@/lib/voiceConsent');
    expect(VOICE_CONSENT_LINE).toBe('People who know you may recognise your voice.');
  });

  it('the sheet shows it as the heading, with no "learn more" escape', () => {
    // Comments stripped first: the file's own header documents the rule
    // ("no Learn more, no link, no pre-tick"), and a guard that cannot tell
    // the rule from its violation is a guard that gets deleted.
    const src  = read('components', 'VoiceConsentSheet.tsx');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toMatch(/VOICE_CONSENT_LINE/);
    expect(code).not.toMatch(/Learn more/i);
    // And it is the heading, not buried in the body copy.
    expect(code).toMatch(/styles\.heading[\s\S]{0,120}VOICE_CONSENT_LINE/);
  });

  it('consent fails closed when storage is unreadable', () => {
    const src = read('lib', 'voiceConsent.ts');
    const fn  = src.slice(src.indexOf('export async function hasAcceptedVoiceConsent'));
    expect(fn.slice(0, fn.indexOf('}\n'))).toMatch(/return false/);
  });

  it('both write screens gate on it before entering voice mode', () => {
    for (const f of [['app', 'write.tsx'], ['app', '(tabs)', 'write.tsx']]) {
      const src = read(...f);
      expect([f.join('/'), /hasAcceptedVoiceConsent/.test(src)]).toEqual([f.join('/'), true]);
      expect([f.join('/'), /VoiceConsentSheet/.test(src)]).toEqual([f.join('/'), true]);
    }
  });
});

describe('the recording cap is enforced in more than one place', () => {
  it('client, database and edge function all say 180 seconds', () => {
    expect(read('lib', 'voiceRecorder.ts')).toMatch(/MAX_RECORDING_MS = 180_000/);
    expect(read('supabase', 'migrations', '20260923000001_voice_confessions.sql'))
      .toMatch(/audio_duration_ms <= 180000/);
    expect(read('supabase', 'functions', 'create-audio-upload', 'index.ts'))
      .toMatch(/MAX_DURATION_MS = 180_000/);
    expect(read('supabase', 'functions', 'submit-confession', 'index.ts'))
      .toMatch(/180_000/);
  });
});

describe('nothing autoplays', () => {
  it('the feed play control fetches its url only on press', () => {
    const src = read('components', 'VoicePlayButton.tsx');
    // getAudioUrl is called from the toggle handler, not from an effect.
    const effects = src.match(/useEffect\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    for (const e of effects) expect(e).not.toMatch(/getAudioUrl/);
    expect(src.slice(src.indexOf('async function toggle'))).toMatch(/getAudioUrl/);
  });

  it('playback stops when the feed loses focus or the app backgrounds', () => {
    const src = read('app', 'explore.tsx');
    expect(src).toMatch(/stopAllPlayback/);
    expect(src).toMatch(/AppState\.addEventListener/);
  });

  it('starting one recording stops any other', () => {
    const src = read('lib', 'audioPlayback.ts');
    const fn  = src.slice(src.indexOf('export function claimPlayback'));
    expect(fn).toMatch(/current\.stop\(\)/);
  });
});

describe('signed urls do not outlive the session', () => {
  it('sign-out clears the url cache', () => {
    // Signed playback urls live in memory for their TTL. Left resolvable after
    // sign-out, the next person on the device could still reach recordings the
    // previous account had been listening to. clearAudioUrlCache existed for
    // this and was called from nowhere until 2026-09-23.
    for (const f of [['app', '(tabs)', 'you.tsx'], ['app', 'settings.tsx']]) {
      const src = read(...f);
      const fn  = src.slice(src.indexOf('async function handleSignOut'));
      expect([f.join('/'), /clearAudioUrlCache\(\)/.test(fn.slice(0, 400))])
        .toEqual([f.join('/'), true]);
    }
  });

  it('account deletion clears it too', () => {
    // The recordings have just been erased server-side; a url still held in
    // memory would outlive the erasure it was promised.
    const src = read('app', '(tabs)', 'you.tsx');
    const blk = src.slice(src.indexOf('await deleteAccount(mode)'));
    expect(blk.slice(0, 400)).toMatch(/clearAudioUrlCache\(\)/);
  });
});

describe('the full-text view keeps the audio', () => {
  it('read-detail offers playback for voice confessions', () => {
    // The feed card truncates long text, so a voice confession with a long
    // transcript is opened HERE. Without this the play control disappeared at
    // exactly the point someone chose to engage with it properly.
    const src = read('app', 'read-detail.tsx');
    expect(src).toMatch(/audioDurationMs/);
    expect(src).toMatch(/confessionId=\{audioMs \? id : undefined\}/);
  });

  it('the feed carries the duration through the handoff', () => {
    const src = read('app', 'explore.tsx');
    const blk = src.slice(src.indexOf('setConfessionHandoff({'));
    expect(blk.slice(0, 300)).toMatch(/audioDurationMs/);
  });
});

describe('the transcript is always visible', () => {
  it('the play control is rendered in addition to the text, not instead of it', () => {
    const src = read('components', 'ReadCard.tsx');
    // The body text renders unconditionally; the audio control is the part
    // behind a condition. If that ever inverts, a deaf reader loses the
    // confession entirely.
    expect(src).toMatch(/\{confessionId && audioDurationMs \? \(/);
    const bodyIdx  = src.indexOf('style={styles.body}');
    const audioIdx = src.indexOf('confessionId && audioDurationMs');
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(audioIdx).toBeGreaterThan(bodyIdx);
  });
});
