/**
 * Voice submission — the ORDER is the safety property.
 *
 * CLAUDE.md invariant 1 says the safety gate runs before anything is stored.
 * For voice that means the recording stays on the phone until the text has
 * cleared moderation and the crisis check. These tests exist because that
 * ordering is invisible in the code's shape — it reads as a sequence of awaits,
 * and a well-meaning refactor that hoists the upload "so it overlaps with the
 * network call" would break it without failing anything else.
 *
 * The file-system mock in jest.setup.js is a real in-memory filesystem, so
 * "was the recording deleted" is asserted as the file being GONE rather than
 * as a delete function having been called.
 */

const mockInvoke = jest.fn();
const mockUpload = jest.fn().mockResolvedValue({ error: null });

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: { user: {} } } }) },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    storage: { from: () => ({ uploadToSignedUrl: (...a: unknown[]) => mockUpload(...a) }) },
  },
}));

const mockSubmitConfession = jest.fn();
jest.mock('@/lib/api', () => ({
  submitConfession: (...a: unknown[]) => mockSubmitConfession(...a),
}));

import { File } from 'expo-file-system';
import { submitVoiceConfession, discardLocalRecording } from '@/lib/voiceSubmit';

// The in-memory FS the mock is backed by.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __mockFs } = require('expo-file-system') as { __mockFs: Map<string, Uint8Array> };

const URI = 'file:///cache/recording_1.wav';

/** A tiny but structurally valid 16 kHz mono WAV. */
function wavBytes(frames = 1600): Uint8Array {
  const dataBytes = frames * 2;
  const buf  = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const b    = new Uint8Array(buf);
  const str  = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); view.setUint32(4, buf.byteLength - 8, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, dataBytes, true);
  return b;
}

function args(over: Partial<Parameters<typeof submitVoiceConfession>[0]> = {}) {
  return {
    text:          'the edited words',
    rawTranscript: 'the words as heard',
    audioUri:      URI,
    deviceHash:    'hash',
    region:        'IN',
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  __mockFs.clear();
  __mockFs.set(URI, wavBytes());
  mockInvoke.mockResolvedValue({ data: { path: 'voice/abc.mp3', token: 'tok' }, error: null });
  mockUpload.mockResolvedValue({ error: null });
});

describe('nothing is uploaded until the text has passed', () => {
  it('a BLOCKED submission uploads no audio', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'blocked', blockReason: 'policy_violation' });
    const r = await submitVoiceConfession(args());

    expect(r.type).toBe('blocked');
    expect(r.audioAttached).toBe(false);
    // Neither the authorisation call nor the upload happened.
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('a CRISIS result uploads nothing and deletes the recording', async () => {
    // CLAUDE.md invariant 6. Crisis audio is never stored, never playable,
    // never retained — including on the writer's own device.
    //
    // submittedId is present ON PURPOSE, and this is the point of the test.
    // A real crisis response does not carry one, so an earlier version of this
    // test passed even with the crisis branch DELETED — the later
    // `if (!confessionId)` guard was silently doing the work, and the test was
    // verifying a different line than it claimed. Found by mutation testing.
    // With an id present, the crisis check is the ONLY thing that can stop the
    // upload, which is what we actually need to hold.
    mockSubmitConfession.mockResolvedValue({
      type: 'crisis', crisisResources: [], submittedId: 'should-never-be-used',
    });
    const r = await submitVoiceConfession(args());

    expect(r.type).toBe('crisis');
    expect(r.audioAttached).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(new File(URI).exists).toBe(false);
  });

  it('a BLOCKED result with an id also uploads nothing', async () => {
    // Same hazard in the other branch.
    mockSubmitConfession.mockResolvedValue({
      type: 'blocked', blockReason: 'policy_violation', submittedId: 'should-never-be-used',
    });
    await submitVoiceConfession(args());
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('the text is submitted BEFORE any upload authorisation is requested', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
    await submitVoiceConfession(args());

    const submitAt = mockSubmitConfession.mock.invocationCallOrder[0];
    const authAt   = mockInvoke.mock.invocationCallOrder[0];
    const uploadAt = mockUpload.mock.invocationCallOrder[0];
    expect(authAt).toBeGreaterThan(submitAt);
    expect(uploadAt).toBeGreaterThan(authAt);
  });
});

describe('both texts reach the safety gate', () => {
  it('sends the raw transcript alongside the edited text', async () => {
    // Without this an edit launders content: say the blocked thing, delete it
    // from the transcript, publish the recording of yourself saying it.
    mockSubmitConfession.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
    await submitVoiceConfession(args({ text: 'clean version', rawTranscript: 'what was said' }));

    const [text, , , , voice] = mockSubmitConfession.mock.calls[0];
    expect(text).toBe('clean version');
    expect(voice.rawTranscript).toBe('what was said');
    expect(voice.audioDurationMs).toBeGreaterThan(0);
  });
});

describe('the audio is attached to the AUTHOR\'S OWN confession', () => {
  it('uses submittedId, never the matched confession id', async () => {
    // match.id is somebody else's confession — the one shown in return.
    // Attaching here would publish this writer's voice under a stranger's words.
    mockSubmitConfession.mockResolvedValue({
      type: 'submitted',
      submittedId: 'mine-123',
      match: { id: 'theirs-999', text: 'someone else', feltCount: 4 },
    });
    await submitVoiceConfession(args());

    expect(mockInvoke).toHaveBeenCalledWith(
      'create-audio-upload',
      expect.objectContaining({ body: expect.objectContaining({ confessionId: 'mine-123' }) }),
    );
  });

  it('attaches nothing when no id came back', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'submitted' });
    const r = await submitVoiceConfession(args());
    expect(r.audioAttached).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

describe('the local recording never outlives the submission', () => {
  it('is deleted after a successful post', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
    const r = await submitVoiceConfession(args());
    expect(r.audioAttached).toBe(true);
    expect(new File(URI).exists).toBe(false);
  });

  it('is deleted when the upload fails', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
    mockUpload.mockResolvedValue({ error: new Error('offline') });

    const r = await submitVoiceConfession(args());
    expect(r.audioAttached).toBe(false);
    // The confession still stands — words that passed the gate are not thrown
    // away because the network failed.
    expect(r.type).toBe('submitted');
    expect(new File(URI).exists).toBe(false);
  });

  it('is deleted when authorisation fails', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
    mockInvoke.mockResolvedValue({ data: null, error: new Error('409') });

    await submitVoiceConfession(args());
    expect(new File(URI).exists).toBe(false);
  });

  it('is deleted when submitConfession THROWS', async () => {
    // The `finally` is doing the work here. An exception is the path most
    // likely to skip cleanup, and the most likely to happen on a bad network.
    mockSubmitConfession.mockRejectedValue(new Error('network'));
    await expect(submitVoiceConfession(args())).rejects.toThrow('network');
    expect(new File(URI).exists).toBe(false);
  });

  it('is deleted when the audio is unreadable', async () => {
    mockSubmitConfession.mockResolvedValue({ type: 'submitted', submittedId: 'c1' });
    __mockFs.set(URI, new Uint8Array([1, 2, 3]));   // not a WAV
    const r = await submitVoiceConfession(args());
    expect(r.audioAttached).toBe(false);
    expect(new File(URI).exists).toBe(false);
  });
});

describe('discardLocalRecording', () => {
  it('removes the file', () => {
    expect(new File(URI).exists).toBe(true);
    discardLocalRecording(URI);
    expect(new File(URI).exists).toBe(false);
  });

  it('is safe on a missing file and on null', () => {
    expect(() => discardLocalRecording('file:///cache/nope.wav')).not.toThrow();
    expect(() => discardLocalRecording(null)).not.toThrow();
  });
});
