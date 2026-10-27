/**
 * The story pool (owner decision 2026-10-27).
 *
 * Stories are written by hand and enter through ingest-stories. These checks
 * read the source, because the functions run on Deno and cannot be imported
 * into jest — and because what matters here is that a line of code never
 * comes back, not how it behaves on one input.
 */
import fs from 'fs';
import path from 'path';

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const ingest = read('supabase/functions/ingest-stories/index.ts');
const seeder = read('supabase/functions/push-daily-stories/index.ts');

describe('story pool honesty', () => {
  it('never invents a felt count', () => {
    expect(ingest).toMatch(/felt_count:\s*0,/);
    expect(seeder).not.toMatch(/Math\.random\(\)\s*\*\s*\d+\)\s*\+\s*\d+/);
    expect(seeder).toMatch(/const feltCount = 0;/);
  });

  it('marks every story as generated, never as a real user', () => {
    expect(ingest).toMatch(/source:\s*'generated'/);
    expect(ingest).not.toMatch(/source:\s*'user'/);
  });

  it('only ever reads generated stories back out', () => {
    // The "recent" helper exists so the writer can avoid repeats. It must
    // never hand a real person's confession to anything outside the app.
    const recent = ingest.slice(ingest.indexOf("body.action === 'recent'"), ingest.indexOf('// ── Ingest'));
    expect(recent).toMatch(/\.eq\('source', 'generated'\)/);
  });
});

describe('story pool safety', () => {
  it('runs the crisis list and moderation before inserting', () => {
    const insertAt = ingest.indexOf(".from('confessions').insert(");
    expect(ingest.indexOf('precheck(s)')).toBeLessThan(insertAt);
    expect(ingest.indexOf('passesModeration(text)')).toBeLessThan(insertAt);
  });

  it('fails closed without a moderation key or an ingest secret', () => {
    expect(ingest).toMatch(/if \(!MODERATION_API_KEY\) return false/);
    expect(ingest).toMatch(/if \(!res\.ok\) return false/);
    expect(ingest).toMatch(/if \(!STORY_INGEST_SECRET\)[\s\S]{0,200}503/);
  });

  it('calls no paid model', () => {
    expect(ingest).not.toMatch(/chat\/completions|\/v1\/embeddings|anthropic/i);
  });
});
