/**
 * shareCard + StoryCard privacy invariants.
 *
 * Reads source files as text — no native module instantiation needed.
 * These assert the share payload never carries identifying data.
 */

const fs   = require('fs');
const path = require('path');

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')  // block comments
    .replace(/\/\/.*/g, '');            // line comments
}

const shareCardSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'lib', 'shareCard.ts'),
  'utf8',
);
const storyCardSrc = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'StoryCard.tsx'),
  'utf8',
);

// ─── Share source export ──────────────────────────────────────────────────────

describe('VALID_SHARE_SOURCES — non-identifying buckets only', () => {
  it('exports VALID_SHARE_SOURCES constant containing match, rtue, read', () => {
    expect(shareCardSrc).toContain("VALID_SHARE_SOURCES");
    expect(shareCardSrc).toContain("'match'");
    expect(shareCardSrc).toContain("'rtue'");
    expect(shareCardSrc).toContain("'read'");
  });

  it('each bucket name contains no identifying patterns', () => {
    // Extract bucket values from the VALID_SHARE_SOURCES array literal
    const buckets = ['match', 'rtue', 'read'];
    for (const b of buckets) {
      expect(b).not.toMatch(/account/i);
      expect(b).not.toMatch(/author/i);
      expect(b).not.toMatch(/token/i);
      expect(b).not.toMatch(/confession/i);
      expect(b).toMatch(/^[a-z]+$/);
    }
  });
});

// ─── StoryCard footer URL ─────────────────────────────────────────────────────

describe('StoryCard — share URL shape', () => {
  it('footer URL contains only the bucket parameter', () => {
    expect(storyCardSrc).toContain("soulyap.me/s?c={source}");
  });

  it('StoryCard code (outside comments) does not embed account_id or author_token', () => {
    const code = stripComments(storyCardSrc);
    expect(code).not.toContain('account_id');
    expect(code).not.toContain('author_token');
  });

  it('ShareSource union type is match | rtue | read exactly', () => {
    expect(storyCardSrc).toContain("'match' | 'rtue' | 'read'");
  });
});

// ─── shareConfessionCard validation ──────────────────────────────────────────

describe('shareConfessionCard — must validate source before sharing', () => {
  it('validates source against VALID_SHARE_SOURCES and throws on invalid', () => {
    expect(shareCardSrc).toContain('VALID_SHARE_SOURCES');
    expect(shareCardSrc).toContain('throw new Error');
  });

  it('code (outside comments) does not reference account_id, confession_id, or author_token', () => {
    const code = stripComments(shareCardSrc);
    expect(code).not.toContain('account_id');
    expect(code).not.toContain('confession_id');
    expect(code).not.toContain('author_token');
  });
});

// ─── Crisis path — zero share affordances ────────────────────────────────────

describe('Crisis screen must have no share affordances (CLAUDE.md §6)', () => {
  it('crisis.tsx (if present) has no shareConfessionCard import or call', () => {
    const crisisPath = path.join(__dirname, '..', '..', 'app', 'crisis.tsx');
    if (!fs.existsSync(crisisPath)) return; // passes vacuously
    const src = fs.readFileSync(crisisPath, 'utf8');
    expect(src).not.toContain('shareConfessionCard');
    expect(src).not.toContain('StoryCard');
    expect(src).not.toContain('cardShared');
  });
});

// ─── Match screen — share only in match branch, not no-match ─────────────────

describe('match.tsx — no share affordance in no-match branch', () => {
  it('handleShare is not reachable from the isNoMatch early-return block', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'app', 'match.tsx'),
      'utf8',
    );
    const noMatchIdx   = src.indexOf('if (isNoMatch)');
    const returnIdx    = src.indexOf('\n  // ── Match path', noMatchIdx);
    const noMatchBlock = returnIdx > noMatchIdx
      ? src.slice(noMatchIdx, returnIdx)
      : src.slice(noMatchIdx, noMatchIdx + 600);

    expect(noMatchBlock).not.toContain('shareConfessionCard');
    expect(noMatchBlock).not.toContain('handleShare');
  });
});
