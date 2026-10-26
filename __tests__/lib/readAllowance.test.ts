/**
 * The daily read allowance, and whether it binds.
 *
 * DAILY_ALLOWANCE is a conversion nudge, deliberately client-side and
 * deliberately cheap to defeat (lib/readAllowance.ts). What it must not be
 * is accidentally OFF — a cap nobody is subject to is not a gentle cap, it
 * is a different product.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDailyLimit, DAILY_ALLOWANCE, PER_WRITE, grantForWrite,
} from '@/lib/readAllowance';

beforeEach(async () => { await AsyncStorage.clear(); });

// ─── The cap has to actually bind ────────────────────────────────────────────

describe('the feed is capped once the premium answer arrives', () => {
  /**
   * Reported 2026-10-02: "the feed is unlimited now."
   *
   * It was. app/(tabs)/explore.tsx reads the limit ONCE, inside the feed
   * fetch, as `premiumReady ? isPremium : true` — failing OPEN so a billing
   * hiccup never tells somebody they have run out. The premium provider
   * starts `ready: false` and settles asynchronously, so the fetch almost
   * always won the race, passed `true`, and got back null.
   *
   * null is UNLIMITED. Nothing asked again, so the momentary default became
   * the whole session, and DAILY_ALLOWANCE stopped existing for free
   * readers.
   */
  const fs   = require('fs');
  const path = require('path');
  const src  = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', '(tabs)', 'explore.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('the limit is re-read when premiumReady flips', () => {
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(!premiumReady\) return;/);
    expect(src).toMatch(/\[premiumReady, isPremium\]/);
  });

  it('and it still fails open on the first pass', () => {
    // A billing hiccup must never be why someone is told they ran out.
    expect(src).toMatch(/premiumReady \? isPremium : true/);
  });

  it('the rendered feed is sliced to it', () => {
    expect(src).toMatch(/confessions\.slice\(0, dailyLimit\)/);
  });
});

describe('what a free reader gets', () => {
  it('is DAILY_ALLOWANCE, not unlimited', async () => {
    expect(await getDailyLimit({ isPremium: false })).toBe(DAILY_ALLOWANCE);
  });

  it('premium is the only unlimited case', async () => {
    expect(await getDailyLimit({ isPremium: true })).toBeNull();
  });
});
