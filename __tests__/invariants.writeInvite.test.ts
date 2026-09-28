/**
 * W1 invariants that live in app/explore.tsx.
 *
 * Source-level, because rendering the feed means standing up a FlatList, the
 * recommender, playback and the allowance — and the properties worth pinning
 * here are structural: which component is rendered where, and which rules the
 * separator defers to. The placement RULE itself is unit-tested against the
 * pure `interstitialAt` in __tests__/lib/writeInvite.test.ts.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const explore = read('app/explore.tsx');
const write   = read('app/write.tsx');
const tabs    = read('app/(tabs)/write.tsx');
const crisis  = read('app/crisis.tsx');

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
}
const exploreCode = stripComments(explore);

describe('the two asks are never rendered together', () => {
  it('has no block rendering WriteInviteCard and PremiumCard as siblings mid-feed', () => {
    // Checked on the separator REGION rather than by matching the old source
    // shape: any rewrite that reintroduces the pair should fail this, not just
    // a rewrite that happens to look the way the old one did.
    const sep = exploreCode.slice(
      exploreCode.indexOf('ItemSeparatorComponent'),
      exploreCode.indexOf('contentContainerStyle'));
    expect(sep).toContain('WriteInviteCard');
    expect(sep).toContain('PremiumCard');
    // Each appears exactly once, on its own branch — never both in one return.
    expect(sep.match(/<WriteInviteCard/g)).toHaveLength(1);
    expect(sep.match(/<PremiumCard/g)).toHaveLength(1);
    for (const ret of sep.split('return (').slice(1)) {
      const body = ret.slice(0, ret.indexOf(');'));
      expect(body.includes('<WriteInviteCard') && body.includes('<PremiumCard')).toBe(false);
    }
  });

  it('defers the mid-feed placement to interstitialAt rather than inlining it', () => {
    expect(exploreCode).toContain('interstitialAt(i, INTERSTITIAL_EVERY)');
    // An inline modulo alongside it would mean two rules that can disagree.
    const sep = exploreCode.slice(exploreCode.indexOf('ItemSeparatorComponent'));
    expect(sep.slice(0, 1200)).not.toMatch(/%\s*INTERSTITIAL_EVERY/);
  });

  it('still stacks both in the FOOTER, where nothing is being interrupted', () => {
    const footer = exploreCode.slice(exploreCode.indexOf('footerCards'));
    expect(footer).toContain('WriteInviteCard');
    expect(footer).toContain('PremiumCard');
  });
});

describe('the targeted invite', () => {
  it('is rendered in the separator, between cards, never replacing one', () => {
    // renderItem draws confessions and nothing else: an invite rendered there
    // would take a confession's place instead of sitting in the gap.
    const renderItem = exploreCode.slice(
      exploreCode.indexOf('renderItem='), exploreCode.indexOf('ItemSeparatorComponent'));
    expect(renderItem).not.toContain('TargetedWriteInvite');
    expect(exploreCode).toContain('<TargetedWriteInvite');
  });

  it('is earned by felts, through recordFelt', () => {
    expect(exploreCode).toContain('recordFelt(');
    expect(exploreCode).toContain('handleFelt');
  });

  it('suppresses the generic write ask once it has been settled', () => {
    expect(exploreCode).toContain('genericInviteAllowed()');
  });

  it('"Not now" calls dismissWriteInvite, not just local state', () => {
    // Clearing only the local state would bring the generic ask straight back.
    expect(exploreCode).toContain('dismissWriteInvite()');
  });

  it('hands the starter to the write screen as a param', () => {
    expect(exploreCode).toMatch(/starter:\s*inv\.starter/);
  });
});

describe('reading is not changed by any of this (CLAUDE.md #2)', () => {
  it('adds no refresh gesture', () => {
    expect(exploreCode).not.toContain('RefreshControl');
    expect(exploreCode).not.toContain('onRefresh');
  });

  it('still loads only on an explicit tap', () => {
    expect(exploreCode).not.toContain('onEndReached');
    expect(exploreCode).toContain('Keep reading');
  });

  it('keeps the end-of-feed state', () => {
    expect(exploreCode).toContain('exhausted');
  });
});

describe('nothing reaches the crisis path', () => {
  it('crisis.tsx has no starters, no invite, no write ask', () => {
    for (const forbidden of [
      'StarterChips', 'useStarters', 'starters', 'TargetedWriteInvite',
      'WriteInviteCard', 'PremiumCard', 'recordFelt',
    ]) {
      expect(crisis).not.toContain(forbidden);
    }
  });
});

describe('both write screens behave identically', () => {
  it.each([['app/write.tsx', write], ['app/(tabs)/write.tsx', tabs]])(
    '%s renders the chips and accepts a starter param', (_name, src) => {
      const code = stripComments(src);
      expect(code).toContain('<StarterChips');
      expect(code).toContain('useStarters(draft)');
      expect(code).toMatch(/useLocalSearchParams<\{[^}]*starter\?: string/);
      expect(code).toMatch(/setDraft\(starter\)/);
      // Hidden in voice mode: a recording has no caret to insert into.
      expect(code).toMatch(/\{!voiceMode && \(\s*<StarterChips/);
    });

  it.each([['app/write.tsx', write], ['app/(tabs)/write.tsx', tabs]])(
    '%s does not gate submission on having used a starter', (_name, src) => {
      // Writing is never gated (CLAUDE.md #2). A submit path that consulted the
      // starter state would be exactly that.
      const code  = stripComments(src);
      const start = code.indexOf('async function handleSubmit');
      expect(start).toBeGreaterThan(-1);
      // Bounded to the submit path itself — slicing to end-of-file would drag
      // in the JSX, where `starters={starters}` appears legitimately and would
      // make this assertion fail for the wrong reason.
      const end    = code.indexOf('return (', start);
      const submit = code.slice(start, end > start ? end : start + 3000);
      expect(submit).not.toContain('starters');
      expect(submit).not.toContain('startersVisible');
    });
});

describe('analytics stay labels and ids', () => {
  const analytics = read('lib/analytics.ts');

  it('declares the four W1 events', () => {
    for (const e of ['starter_shown', 'starter_used', 'write_invite_shown', 'write_invite_tapped']) {
      expect(analytics).toContain(e);
    }
  });

  it('carries a category or a kind — never text, a draft, or a confession id', () => {
    const block = analytics.slice(analytics.indexOf("'starter_shown'"));
    const decl  = block.slice(0, block.indexOf('write_invite_tapped') + 200);
    expect(decl).not.toMatch(/\btext\b|\bdraft\b|\bstarter:\s*string/);
    expect(decl).toMatch(/category:\s*string/);
    expect(decl).toMatch(/kind:\s*WriteInviteKind/);
  });

  it('CLAUDE.md lists them', () => {
    const doc = read('CLAUDE.md');
    for (const e of ['starter_shown', 'starter_used', 'write_invite_shown', 'write_invite_tapped']) {
      expect(doc).toContain(e);
    }
  });
});

describe('the docs match the code on the intro window', () => {
  const doc = read('CLAUDE.md');

  it('no longer claims the write invite waits for a 30-day window', () => {
    expect(doc).not.toContain('**PROMPT shown after a 30-day intro window**');
    expect(doc).toContain('from day one');
  });

  it('records the decision with its date', () => {
    expect(doc).toContain('Owner decision 2026-09-27');
  });

  it('keeps markInstall, whose date is not recoverable', () => {
    expect(read('app/index.tsx')).toContain('markInstall');
    expect(read('lib/introWindow.ts')).toContain('export async function markInstall');
  });

  it('explore.tsx no longer describes a window it never implemented', () => {
    const footer = explore.slice(explore.indexOf('footerCards') - 1400, explore.indexOf('footerCards'));
    expect(footer).not.toMatch(/only after the\s*\n?\s*\*?\s*intro window/);
  });
});
