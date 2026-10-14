export const slowMs = 250;
export const fastMs = 20;
// CI default per-command delay: a small hydration buffer for slow runners, not a
// substitute for retry-ability. Assertions and intercept waits carry the sync load.
const ciMs = 100;
export const defaultMs = process.env['CI'] ? ciMs : fastMs;
