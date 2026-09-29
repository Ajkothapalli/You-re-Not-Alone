/**
 * [F] Open a Feeling.
 *
 * The page publishes one real person's confession to anyone holding a link.
 * Almost everything here is a negative assertion, because the failure modes
 * are all disclosure:
 *
 *   - enumerable pages (lookup by confession id instead of token)
 *   - a "gone" response that is distinguishable from "never existed"
 *   - a sealed share leaking its words
 *   - an id, token or timestamp riding along in a field nobody renders
 *   - the confession text reaching an Open Graph tag, which other companies'
 *     servers cache permanently and outside our control
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ROOT = path.join(__dirname, '..');
const WEB  = path.join(os.homedir(), 'Desktop', 'yana-website');
const read = (...p: string[]) => fs.readFileSync(path.join(...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
const ddl  = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

const fn     = read(ROOT, 'supabase', 'functions', 'open-feeling', 'index.ts');
const fnCode = code(fn);
const minter = code(read(ROOT, 'supabase', 'functions', 'create-share-token', 'index.ts'));
const sql    = ddl(read(ROOT, 'supabase', 'migrations', '20260929000002_open_feeling.sql'));
const page   = code(read(WEB, 'api', 'feeling.js'));

// ─── Pages cannot be enumerated ──────────────────────────────────────────────

describe('lookup is by token, never by confession id', () => {
  it('the only entry point is a 10-character token', () => {
    expect(fnCode).toMatch(/TOKEN_RE = \/\^\[A-Za-z0-9\]\{10\}\$\//);
    expect(fnCode).toMatch(/if \(!TOKEN_RE\.test\(token\)\) return json\(GONE\)/);
  });

  it('the confession is reached THROUGH the token row', () => {
    const tokenLookup = fnCode.indexOf("from('share_tokens')");
    const confLookup  = fnCode.indexOf("from('confessions')");
    expect(tokenLookup).toBeGreaterThan(-1);
    expect(confLookup).toBeGreaterThan(tokenLookup);
    // Never a confession id straight off the request.
    expect(fnCode).not.toMatch(/body\.confessionId/);
  });

  it('the schema is not indexed for reverse lookups', () => {
    // An index is an invitation to query that way. The only supported
    // direction is token → content.
    expect(sql).not.toMatch(/CREATE INDEX[^;]*share_tokens[^;]*confession_id/);
    expect(sql).not.toMatch(/CREATE INDEX[^;]*share_tokens[^;]*account_id/);
  });
});

// ─── Every failure is indistinguishable ──────────────────────────────────────

describe('gone and never-existed look identical', () => {
  it('there is exactly one GONE body', () => {
    expect(fnCode).toMatch(/const GONE = \{ kind: 'gone' as const \}/);
  });

  it.each([
    ['invalid token',   /TOKEN_RE\.test\(token\)\) return json\(GONE\)/],
    ['unknown token',   /if \(!share\) return json\(GONE\)/],
    ['removed/hidden',  /status !== 'live' && c\.status !== 'approved'\) return json\(GONE\)/],
    ['auto-flagged',    /auto_flagged\) return json\(GONE\)/],
    ['generated/seed',  /source !== 'user'\) return json\(GONE\)/],
    ['reported',        /reported\) return json\(GONE\)/],
  ])('%s returns it', (_label, re) => {
    expect(fnCode).toMatch(re);
  });

  it('re-checks status on EVERY visit, not at share time', () => {
    // A confession removed an hour ago must stop being readable through a
    // link shared last week.
    const conf = fnCode.slice(fnCode.indexOf("from('confessions')"));
    expect(conf).toMatch(/status/);
    expect(conf).toMatch(/auto_flagged/);
  });
});

// ─── Nothing identifying is returned ─────────────────────────────────────────

describe('the response carries content, never a row', () => {
  // Bounded to a single statement. An unbounded [\s\S]*? runs past
  // `return json({ ... }, 405);` — whose `}, 405)` does not close the match —
  // and swallows the next hundred lines, so the assertion below was testing
  // the whole file rather than a response body.
  const returned = [...fnCode.matchAll(/return json\(\{[^;]*?\}\);/g)].map((m) => m[0]);

  it('found the response shapes', () => {
    expect(returned.length).toBeGreaterThanOrEqual(4);
  });

  it.each(['id:', 'confession_id', 'account_id', 'author_token', 'token',
           'created_at', 'persona', 'starts_on'])(
    'no response includes %s', (field) => {
      for (const r of returned) expect(r).not.toContain(field);
    });

  it('returns the HUMAN-only felt count', () => {
    // felt_count includes fabricated seed values and generated-companion
    // increments; this number is printed under someone's words as a claim
    // about people.
    expect(fnCode).toMatch(/real_felt_count/);
    expect(fnCode).not.toMatch(/c\.felt_count/);
  });

  it('hides the count at zero', () => {
    expect(fnCode).toMatch(/felt > 0 \? felt : null/);
  });
});

// ─── Sealed stays sealed ─────────────────────────────────────────────────────

describe('a sealed share never reveals the words', () => {
  it('the words ride on the SHARER\'s recorded choice', () => {
    expect(fnCode).toMatch(/if \(!share\.words_included\)/);
  });

  it('the sealed branch returns before any text is added', () => {
    const sealed = fnCode.slice(fnCode.indexOf("if (!share.words_included)"));
    const body   = sealed.slice(0, sealed.indexOf('});') + 3);
    expect(body).not.toContain('text:');
  });

  it('the choice is captured at share time and never revisited', () => {
    expect(minter).toMatch(/words_included: wordsIncluded/);
    expect(sql).toMatch(/words_included\s+boolean NOT NULL DEFAULT false/);
  });
});

// ─── The minter authorises what it records ───────────────────────────────────

describe('create-share-token checks what may be shared', () => {
  it('rtue must be the caller\'s OWN confession', () => {
    expect(minter).toMatch(/c!\.account_id === user\.id/);
  });

  it('read must be a confession that was actually visible', () => {
    expect(minter).toMatch(/status === 'live' \|\| c\.status === 'approved'/);
    expect(minter).toMatch(/c\.source === 'user'/);
    expect(minter).toMatch(/!c\.auto_flagged/);
  });

  it('a failed check drops the link, never the share', () => {
    // Losing a doorway is a smaller harm than losing someone's share.
    // Bounded by CODE, not by a comment: minter is comment-stripped, so the
    // old 'Daily cap' marker did not exist and the slice ran to end of file.
    const start = minter.indexOf('let confessionId');
    const end   = minter.indexOf("from('share_tokens')", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = minter.slice(start, end);
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/return json\(/);
  });
});

// ─── Opens are people, not previews ──────────────────────────────────────────

describe('a link preview is not an open', () => {
  it.each(['whatsapp', 'facebookexternalhit', 'telegrambot', 'slackbot',
           'twitterbot', 'googlebot', 'bingbot', 'discordbot'])(
    'excludes %s', (bot) => {
      expect(fnCode.toLowerCase()).toContain(bot);
    });

  it('an empty user agent does not count either', () => {
    expect(fnCode).toMatch(/ua\.trim\(\) === ''/);
  });

  it('counts once per visitor per day', () => {
    expect(sql).toMatch(/PRIMARY KEY \(token, day, visitor_hash\)/);
    expect(fnCode).toMatch(/if \(isBot\) return/);
  });

  it('the visitor hash rotates daily, so it cannot follow anyone', () => {
    expect(fnCode).toMatch(/hmac\(`open:\$\{day\}:\$\{ip\}:\$\{ua\}`\)/);
  });

  it('stores no IP, user agent or precise time of day', () => {
    const table = sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS share_opens'));
    const body  = table.slice(0, table.indexOf(');'));
    expect(body).not.toMatch(/\bip\b|user_agent|\bua\b/);
    expect(body).toMatch(/day\s+date/);
  });
});

// ─── Server-only ─────────────────────────────────────────────────────────────

describe('the new tables are server-only', () => {
  it('share_opens has RLS on and no client grants', () => {
    expect(sql).toMatch(/ALTER TABLE share_opens ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON share_opens FROM anon, authenticated/);
    expect(sql).not.toMatch(/CREATE POLICY[^\n]*ON share_opens/);
  });

  it('the open count function is service-role only', () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION share_open_count/);
  });

  it('the table comment explains why the link is allowed', () => {
    const raw = read(ROOT, 'supabase', 'migrations', '20260929000002_open_feeling.sql');
    expect(raw).toMatch(/COMMENT ON TABLE share_tokens/);
    expect(raw).toMatch(/never returned to any client/i);
  });
});

// ─── The website ─────────────────────────────────────────────────────────────

describe('the doorway page', () => {
  it('renders server-side — no confession text in client JS', () => {
    const beacon = read(WEB, 's', 'beacon.js');
    expect(beacon).not.toMatch(/text|confession|\bt\b\s*=/);
    expect(beacon).toMatch(/source: bucket/);
  });

  it('keeps the token out of the page\'s JavaScript', () => {
    // The beacon is handed a bucket only.
    expect(page).toMatch(/data-bucket="\$\{esc\(bucket\)\}"/);
    expect(page).not.toMatch(/data-token/);
  });

  it('Open Graph tags are GENERIC', () => {
    // Preview servers cache these permanently, outside our control, for a
    // confession that may be deleted an hour later.
    const head = page.slice(page.indexOf('og:title'), page.indexOf('</head>'));
    expect(head).not.toContain('${');
    expect(head).toContain('soulyap');
  });

  it('is never indexed or shared-cached', () => {
    expect(page).toMatch(/X-Robots-Tag', 'noindex, nofollow'/);
    expect(page).toMatch(/Cache-Control', 'private, no-store'/);
    const robots = read(WEB, 'robots.txt');
    expect(robots).toMatch(/Disallow: \/s/);
  });

  it('escapes everything it interpolates', () => {
    expect(page).toMatch(/function esc\(/);
    for (const slot of ['body', 'category', 'cta', 'sub', 'heading']) {
      expect(page).toMatch(new RegExp(`esc\\(${slot}\\)`));
    }
  });

  it('carries the token to Play, and only there', () => {
    expect(page).toMatch(/utm_content=' \+ token/);
  });
});
