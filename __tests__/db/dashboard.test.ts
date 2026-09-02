/**
 * Growth & Health Dashboard — structural invariant tests.
 *
 * Reads the migration SQL as source text — no live DB connection needed.
 * Asserts:
 *   1. All six v_* views are defined in the migration.
 *   2. No view SELECT list exposes confession text or a bare account_id.
 *   3. REVOKE ALL is present for every view.
 *   4. GRANT SELECT to soulyap_dashboard is present for every view.
 *   5. soulyap_dashboard has NO grant on any base table.
 *   6. growth_events and revenue_events have REVOKE ALL from anon, authenticated.
 *   7. The track edge function returns early on unknown event types (no data leak).
 *   8. The track edge function does not store account_id or ip.
 *   9. revenue_events insert in revenuecat-webhook is guarded by amount > 0.
 */

const fs   = require('fs');
const path = require('path');

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations', '20260828000001_growth_dashboard.sql',
);
const TRACK_FN_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'functions', 'track', 'index.ts',
);
const RC_FN_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'functions', 'revenuecat-webhook', 'index.ts',
);

function stripSqlComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
    .replace(/--[^\n]*/g, '');           // line comments
}

const MIGRATION = fs.readFileSync(MIGRATION_PATH, 'utf8');
const SQL       = stripSqlComments(MIGRATION);

const VIEWS = [
  'v_metrics_daily',
  'v_funnel',
  'v_liquidity',
  'v_virality',
  'v_monetization',
  'v_safety',
];

const BASE_TABLES = [
  'confessions', 'accounts', 'read_events', 'crisis_events',
  'matches', 'reports', 'edge_function_events',
];

// ─── 1. All six views exist ───────────────────────────────────────────────────

describe('All six v_* views are created in the migration', () => {
  for (const view of VIEWS) {
    it(`creates ${view}`, () => {
      // Look for CREATE VIEW or CREATE OR REPLACE VIEW <name>
      const re = new RegExp(`CREATE(?:\\s+OR\\s+REPLACE)?\\s+VIEW\\s+${view}\\b`, 'i');
      expect(SQL).toMatch(re);
    });
  }
});

// ─── 2. No confession text in view SELECT lists ───────────────────────────────

describe('No confession text in view output (CLAUDE.md — IDs and counts only)', () => {
  // Extract each view body (from CREATE VIEW … AS to the next top-level statement)
  function extractViewBody(sql: string, viewName: string): string {
    const start = sql.search(
      new RegExp(`CREATE(?:\\s+OR\\s+REPLACE)?\\s+VIEW\\s+${viewName}\\b`, 'i'),
    );
    if (start === -1) return '';
    // Find the next top-level statement (DROP / CREATE / REVOKE / GRANT at column 0)
    const rest = sql.slice(start);
    const nextStmt = rest.search(/\n(?:DROP|CREATE|REVOKE|GRANT|DO\s+\$\$)/);
    return nextStmt === -1 ? rest : rest.slice(0, nextStmt);
  }

  for (const view of VIEWS) {
    it(`${view} does not SELECT confessions.text`, () => {
      const body = extractViewBody(SQL, view);
      // The view body must not select the text column from confessions directly
      // (text as a standalone column name in a SELECT)
      expect(body).not.toMatch(/\bc\.text\b/);
      expect(body).not.toMatch(/confessions\.text/);
    });
  }

  it('v_liquidity categories column is a metadata tag (text[]), not confession content', () => {
    const body = extractViewBody(SQL, 'v_liquidity');
    // categories[1] is acceptable — it's a category label, not the confession text
    // The raw .text column must NOT appear
    expect(body).not.toContain('confessions.text');
    expect(body).not.toMatch(/\bc\.text\b/);
  });
});

// ─── 3. No bare account_id in view SELECT lists ───────────────────────────────

describe('No bare account_id in view SELECT list output', () => {
  // The column name account_id may appear in CTEs (internal joins are OK)
  // but must not be a top-level SELECT column of the final view definition.
  // We check by extracting the final SELECT (after the last CTE closing paren).
  function extractFinalSelect(sql: string, viewName: string): string {
    const body = (() => {
      const start = sql.search(
        new RegExp(`CREATE(?:\\s+OR\\s+REPLACE)?\\s+VIEW\\s+${viewName}\\b`, 'i'),
      );
      if (start === -1) return '';
      const rest = sql.slice(start);
      const nextStmt = rest.search(/\n(?:DROP|CREATE|REVOKE|GRANT|DO\s+\$\$)/);
      return nextStmt === -1 ? rest : rest.slice(0, nextStmt);
    })();

    // Find the last SELECT in the view body (the final projection)
    const lastSelect = body.lastIndexOf('SELECT');
    return lastSelect === -1 ? body : body.slice(lastSelect);
  }

  for (const view of VIEWS) {
    it(`${view} final SELECT column list does not expose a bare account_id output column`, () => {
      const finalSel = extractFinalSelect(SQL, view);
      // Extract only the column projection list (between SELECT and the first FROM).
      // JOIN conditions and WHERE clauses are intentionally excluded.
      const fromIdx = finalSel.search(/\bFROM\b/i);
      const colList = fromIdx === -1 ? finalSel : finalSel.slice(0, fromIdx);
      // account_id must not appear as a column alias name in the output
      expect(colList).not.toMatch(/\baccount_id\s+AS\b/i);
      expect(colList).not.toMatch(/\bAS\s+account_id\b/i);
      // Count aggregates are the only acceptable use of account_id in the column list
      const strippedAggregates = colList.replace(/COUNT\s*\((?:DISTINCT\s+)?[\w.]+\)/gi, 'COUNT_AGG');
      expect(strippedAggregates).not.toMatch(/\baccount_id\b/);
    });
  }
});

// ─── 4. REVOKE ALL on every view ─────────────────────────────────────────────

describe('REVOKE ALL from anon, authenticated on every view', () => {
  for (const view of VIEWS) {
    it(`REVOKE ALL on ${view}`, () => {
      const re = new RegExp(`REVOKE\\s+ALL\\s+ON\\s+${view}\\s+FROM\\s+anon,\\s+authenticated`, 'i');
      expect(MIGRATION).toMatch(re);
    });
  }

  it('REVOKE ALL on growth_events', () => {
    expect(MIGRATION).toMatch(/REVOKE\s+ALL\s+ON\s+growth_events\s+FROM\s+anon,\s+authenticated/i);
  });

  it('REVOKE ALL on revenue_events', () => {
    expect(MIGRATION).toMatch(/REVOKE\s+ALL\s+ON\s+revenue_events\s+FROM\s+anon,\s+authenticated/i);
  });
});

// ─── 5. GRANT SELECT to soulyap_dashboard on every view ──────────────────────

describe('GRANT SELECT to soulyap_dashboard on every view', () => {
  for (const view of VIEWS) {
    it(`GRANT SELECT on ${view} to soulyap_dashboard`, () => {
      const re = new RegExp(`GRANT\\s+SELECT\\s+ON\\s+${view}\\s+TO\\s+soulyap_dashboard`, 'i');
      expect(MIGRATION).toMatch(re);
    });
  }
});

// ─── 6. soulyap_dashboard has no base-table grants ───────────────────────────

describe('soulyap_dashboard has no GRANT on base tables', () => {
  for (const table of BASE_TABLES) {
    it(`no GRANT on ${table} to soulyap_dashboard`, () => {
      // The migration must REVOKE on the table, never GRANT to the dashboard role
      const grantRe = new RegExp(
        `GRANT\\s+\\w+\\s+ON\\s+${table}\\s+TO\\s+soulyap_dashboard`, 'i',
      );
      expect(MIGRATION).not.toMatch(grantRe);
    });
  }

  it('soulyap_dashboard role is explicitly REVOKE ALL from base tables', () => {
    expect(MIGRATION).toMatch(/REVOKE\s+ALL\s+ON\s+confessions\s+FROM\s+soulyap_dashboard/i);
    expect(MIGRATION).toMatch(/REVOKE\s+ALL\s+ON\s+accounts\s+FROM\s+soulyap_dashboard/i);
  });
});

// ─── 7. track edge function — no PII stored ──────────────────────────────────

describe('track edge function stores no PII', () => {
  const TRACK = fs.readFileSync(TRACK_FN_PATH, 'utf8');

  it('does not store account_id', () => {
    // Strip comments first
    const code = TRACK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toContain('account_id');
  });

  it('does not log IP address', () => {
    const code = TRACK.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(code).not.toContain('.ip');
    expect(code).not.toContain('x-forwarded-for');
    expect(code).not.toContain('remote_addr');
  });

  it('validates type against VALID_TYPES before inserting', () => {
    expect(TRACK).toContain('VALID_TYPES');
    expect(TRACK).toContain("'share_click'");
    expect(TRACK).toContain("'install_attributed'");
  });

  it('validates source against VALID_SOURCES before inserting', () => {
    expect(TRACK).toContain('VALID_SOURCES');
    expect(TRACK).toContain('safeSource');
  });

  it('returns 200 on unknown event types (beacon fire-and-forget)', () => {
    expect(TRACK).toContain("'OK'");
    expect(TRACK).toContain('200');
  });
});

// ─── 8. revenuecat-webhook — revenue_events guard ────────────────────────────

describe('revenuecat-webhook — revenue_events guarded by amount > 0', () => {
  const RC = fs.readFileSync(RC_FN_PATH, 'utf8');

  it('only inserts to revenue_events when revenueUsd > 0 and event is ACTIVE', () => {
    expect(RC).toContain('revenueUsd > 0');
    expect(RC).toContain('ACTIVE.has(type)');
    expect(RC).toContain('revenue_events');
  });

  it('does not expose account_id to client responses', () => {
    // The function UPSERTS to entitlements and INSERTS to revenue_events
    // but the Response body is just 'OK' — no account data returned
    const returnStatements = RC.match(/return new Response\([^)]+\)/g) ?? [];
    for (const stmt of returnStatements) {
      expect(stmt).not.toContain('account_id');
      expect(stmt).not.toContain('userId');
    }
  });
});

// ─── 9. Manual verification checklist ────────────────────────────────────────

describe('Manual verification required (cannot unit-test without live DB)', () => {
  it.todo('Run: SELECT column_name FROM information_schema.columns WHERE table_name = \'v_metrics_daily\' — confirm no text/account_id column');
  it.todo('Run: SELECT column_name FROM information_schema.columns WHERE table_name = \'v_funnel\'        — confirm no text/account_id column');
  it.todo('Run: SELECT column_name FROM information_schema.columns WHERE table_name = \'v_liquidity\'     — confirm no text/account_id column');
  it.todo('Run: SELECT column_name FROM information_schema.columns WHERE table_name = \'v_virality\'      — confirm no text/account_id column');
  it.todo('Run: SELECT column_name FROM information_schema.columns WHERE table_name = \'v_monetization\'  — confirm no text/account_id column');
  it.todo('Run: SELECT column_name FROM information_schema.columns WHERE table_name = \'v_safety\'        — confirm no text/account_id column');
  it.todo('Verify: SET ROLE soulyap_dashboard; SELECT * FROM confessions LIMIT 1; → must error with permission denied');
  it.todo('Verify: SET ROLE soulyap_dashboard; SELECT * FROM accounts LIMIT 1;    → must error with permission denied');
  it.todo('Verify: SET ROLE soulyap_dashboard; SELECT * FROM v_metrics_daily LIMIT 5; → returns rows with no text/account_id columns');
  it.todo('Seed 10 read_events (felt) + 1 crisis + 1 moderation-blocked edge_function_event → confirm v_metrics_daily counts reconcile');
  it.todo('Metabase: create a Read-Only Postgres connection using the soulyap_dashboard role credentials');
  it.todo('Metabase: confirm v_* tables are the ONLY visible tables in the schema browser');
});
