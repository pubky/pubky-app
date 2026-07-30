// Single source of truth for the deterministic clock used by every VRT test.
// Kept in a browser-free module so fixtures (e.g. `posts.ts`, `profiles.ts`)
// and unit tests can import it without pulling in `vitest/browser`.

/** Frozen instant every VRT render pretends is "now". */
export const VRT_FROZEN_NOW_MS = Date.UTC(2026, 0, 1, 12, 0, 0);

/** Generic millisecond duration constants. Live here because every current
 *  consumer expresses durations relative to `VRT_FROZEN_NOW_MS`. Hoist further
 *  when a non-test caller needs them. */
export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Replace `Date.now` so any "x ago" UI is stable for screenshots. */
export function freezeNow(ms: number = VRT_FROZEN_NOW_MS): void {
  Date.now = () => ms;
}

/**
 * Deterministic relative-time formatter aligned to {@link VRT_FROZEN_NOW_MS}.
 *
 * Used as the replacement for `useRelativeTime` in VRT tests so the rendered
 * "x ago" string is identical across runs/locales/formatters.
 */
export function formatStableRelative(timestamp: number): string {
  const diffMs = Math.max(0, VRT_FROZEN_NOW_MS - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
