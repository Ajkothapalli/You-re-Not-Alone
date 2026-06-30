// In-memory only — resets on every native restart and every JS bundle reload.
// Never use this for anything that should survive beyond the current JS session.
export const session = {
  readShown:    false,
  readCredits:  0,   // +2 per write, consumed atomically when entering explore
};
