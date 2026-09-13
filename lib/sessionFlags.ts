// In-memory only — resets on every native restart and every JS bundle reload.
// Never use this for anything that should survive beyond the current JS session.
// Both former flags are gone (owner decision 2026-09-13):
//   readShown   — gated writing behind having read the 2-card screen. That
//                 screen no longer exists, and reading is never a prerequisite.
//   readCredits — "+2 reads per write". The feed is not rationed, so there is
//                 nothing to credit.
// Kept as a module so future in-memory session state has a home.
export const session: Record<string, never> = {};
