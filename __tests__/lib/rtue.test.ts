/**
 * RTUE classify() logic — tested via evaluateRtue() with mocked deps.
 * We export classify() indirectly by driving evaluateRtue() with controlled
 * receipt + DB data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// --- mock confessionReceipt before importing rtue ---
const mockGetReceipts = jest.fn();
jest.mock('@/lib/confessionReceipt', () => ({
  getReceipts: (...args: any[]) => mockGetReceipts(...args),
}));

// --- mock supabase ---
const mockMaybeSingle = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      maybeSingle: (...args: any[]) => mockMaybySingle(...args),
    })),
  },
}));

// Alias so the closure above captures the right ref
const mockMaybySingle = mockMaybeSingle;

import { evaluateRtue, markRtueSeen, clearRtueCache } from '@/lib/rtue';

const RECEIPT = { id: 'confession-abc', feltCountAtSubmit: 0, text: 'test text' };

beforeEach(async () => {
  jest.clearAllMocks();
  clearRtueCache();
  await AsyncStorage.clear();
  mockGetReceipts.mockResolvedValue([RECEIPT]);
  mockMaybeSingle.mockResolvedValue({ data: { felt_count: 0, text: 'test text' } });
});

describe('evaluateRtue — state classification', () => {
  it('returns null when no receipts', async () => {
    mockGetReceipts.mockResolvedValue([]);
    expect(await evaluateRtue()).toBeNull();
  });

  it('returns null when DB row missing (confession removed)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null });
    expect(await evaluateRtue()).toBeNull();
  });

  it('not_yet: count=0, first check (lastSeen=null)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 0, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('not_yet');
    expect(m?.current).toBe(0);
    expect(m?.lastSeen).toBeNull();
  });

  it('null: count=0, already seen before (lastSeen=0 = no change)', async () => {
    await markRtueSeen(RECEIPT.id, 0);
    clearRtueCache();
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 0, text: 'x' } });
    expect(await evaluateRtue()).toBeNull();
  });

  it('one: count=1, first check', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 1, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('one');
  });

  it('few: count=5, first check', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 5, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('few');
  });

  it('few: count=9, first check (boundary)', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 9, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('few');
  });

  it('growing: count=10, gained > 0', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 10, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('growing');
    expect(m?.gained).toBe(10);
  });

  it('growing: count=50, lastSeen=10', async () => {
    await markRtueSeen(RECEIPT.id, 10);
    clearRtueCache();
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 50, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('growing');
    expect(m?.gained).toBe(40);
  });

  it('milestone: crossing 100', async () => {
    await markRtueSeen(RECEIPT.id, 90);
    clearRtueCache();
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 105, text: 'x' } });
    const m = await evaluateRtue();
    expect(m?.state).toBe('milestone');
    expect(m?.current).toBe(105);
  });

  it('milestone: crossing 500', async () => {
    await markRtueSeen(RECEIPT.id, 499);
    clearRtueCache();
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 501, text: 'x' } });
    expect((await evaluateRtue())?.state).toBe('milestone');
  });

  it('null: no change since last seen', async () => {
    await markRtueSeen(RECEIPT.id, 42);
    clearRtueCache();
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 42, text: 'x' } });
    expect(await evaluateRtue()).toBeNull();
  });

  it('uses cache — DB called only once for two evaluateRtue() calls', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { felt_count: 3, text: 'x' } });
    await evaluateRtue();
    await evaluateRtue();
    // from() is called once only (cache hit on second call)
    const { supabase } = require('@/lib/supabase');
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });
});
