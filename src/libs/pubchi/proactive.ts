/**
 * App-open proactive "what you missed" coordinator helpers.
 *
 * Product plan §9 read-only/assisted rows and §16 #3: no hosted bearer, no
 * server scheduler. Quiet hours and frequency use the receiver clock (UTC).
 *
 * Config defaults (pubchi-design.md config.proactive, also the App schema
 * default): enabled false, max_suggestions_per_day 1, quiet_hours_utc 22–7.
 *
 * Budget share: each proactive ask is one existing POST /v1/query (`purpose:
 * ask`) and consumes the same per-owner hourly/daily token caps and
 * per-request budgets as an interactive ask. There is no separate proactive
 * token pool. Hosted `proactive_suggestions_per_day: 0` stays unused (hosted
 * scheduler out for v1). The client frequency cap additionally bounds asks
 * to `config.proactive.max_suggestions_per_day` per UTC day so empty results
 * cannot burn the owner pool.
 */

import type { PubchiConfigV1 } from './schemas/config';
import { PHASE0_BUDGETS } from './schemas/tenant';

export const PROACTIVE_QUESTION = 'What did I miss?';
export const PROACTIVE_PURPOSE = 'ask' as const;
export const DEFAULT_PROACTIVE = {
  enabled: false,
  max_suggestions_per_day: 1,
  quiet_hours_utc: { start: 22, end: 7 },
} as const;

/** Hosted scheduler cap remains 0. App-open asks share PHASE0 owner caps 1:1. */
export const PROACTIVE_BUDGET_SHARE = {
  hosted_proactive_suggestions_per_day: PHASE0_BUDGETS.proactive_suggestions_per_day,
  query_path: '/v1/query',
  purpose: PROACTIVE_PURPOSE,
  owner_hourly_tokens: PHASE0_BUDGETS.per_owner_hourly_tokens,
  owner_utc_day_tokens: PHASE0_BUDGETS.per_owner_utc_day_tokens,
  per_request_input_tokens: PHASE0_BUDGETS.per_request_input_tokens,
  per_request_output_tokens: PHASE0_BUDGETS.per_request_output_tokens,
} as const;

export const PROACTIVE_DISMISS_PREFIX = 'pubchi-proactive-dismiss:';
export const PROACTIVE_ATTEMPT_PREFIX = 'pubchi-proactive-attempt:';
export const PROACTIVE_CLAIM_PREFIX = 'pubchi-proactive-claim:';
export const PROACTIVE_LOCK_PREFIX = 'pubchi-proactive-';

export type QuietHoursUtc = { start: number; end: number };

export type ProactiveGateInput = {
  enabled: boolean;
  maxSuggestionsPerDay: number;
  quietHoursUtc: QuietHoursUtc;
  nowMs: number;
  visible: boolean;
  hasSession: boolean;
  asksToday: number;
  existingSuggestionId?: string | null;
};

export type ProactiveSkipReason =
  'disabled' | 'hidden' | 'no-session' | 'quiet-hours' | 'frequency-cap' | 'deduped' | 'zero-cap' | 'cross-tab';

export function utcHour(nowMs: number): number {
  return new Date(nowMs).getUTCHours();
}

export function utcDayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10).replaceAll('-', '');
}

export function proactiveSuggestionId(nowMs: number): string {
  return `what-i-missed-${utcDayKey(nowMs)}`;
}

/** Same-origin Web Lock name: `pubchi-proactive-YYYYMMDD`. */
export function proactiveLockName(nowMs: number): string {
  return `${PROACTIVE_LOCK_PREFIX}${utcDayKey(nowMs)}`;
}

export function proactiveClaimKey(owner: string, nowMs: number): string {
  return `${PROACTIVE_CLAIM_PREFIX}${owner}:${utcDayKey(nowMs)}`;
}

export function proactiveFallbackLockKey(nowMs: number): string {
  return `${PROACTIVE_CLAIM_PREFIX}lock:${utcDayKey(nowMs)}`;
}

type ProactiveLock = { name: string } | null;

export type ProactiveLockManager = {
  request: <T>(
    name: string,
    options: { ifAvailable: true },
    callback: (lock: ProactiveLock) => Promise<T>,
  ) => Promise<T>;
};

let locksForTests: ProactiveLockManager | null | undefined;

export function setProactiveLocksForTests(locks: ProactiveLockManager | null | undefined): void {
  locksForTests = locks;
}

function resolveLockManager(): ProactiveLockManager | null {
  if (locksForTests !== undefined) return locksForTests;
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  if (!locks?.request) return null;
  return {
    request: (name, options, callback) =>
      locks.request(name, options, (lock) => callback(lock)) as Promise<Awaited<ReturnType<typeof callback>>>,
  };
}

export function hasProactiveDayClaim(owner: string, nowMs: number): boolean {
  return Boolean(storage()?.getItem(proactiveClaimKey(owner, nowMs)));
}

/** Persist that this origin already spent today's ask. Survives Web Lock release. */
export function claimProactiveDay(owner: string, nowMs: number): boolean {
  const store = storage();
  if (!store) return true;
  const key = proactiveClaimKey(owner, nowMs);
  if (store.getItem(key)) return false;
  const token = `${nowMs}:${Math.random().toString(36).slice(2)}`;
  store.setItem(key, token);
  return store.getItem(key) === token;
}

function claimFallbackLock(nowMs: number): boolean {
  const store = storage();
  if (!store) return true;
  const key = proactiveFallbackLockKey(nowMs);
  if (store.getItem(key)) return false;
  store.setItem(key, '1');
  return store.getItem(key) === '1';
}

/**
 * Exclusive same-origin right to GET/ask for this UTC day.
 * Web Locks `ifAvailable: true` when present; otherwise a localStorage claim.
 */
export async function withProactiveDayLock<T>(
  nowMs: number,
  work: () => Promise<T>,
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const name = proactiveLockName(nowMs);
  const locks = resolveLockManager();
  if (locks) {
    return locks.request(name, { ifAvailable: true }, async (lock) => {
      if (!lock) return { acquired: false } as const;
      return { acquired: true as const, value: await work() };
    });
  }
  if (!claimFallbackLock(nowMs)) return { acquired: false };
  return { acquired: true, value: await work() };
}

/** Inclusive of `start`, exclusive of `end`. Wrap-around (22→7) is quiet. */
export function isQuietHour(hourUtc: number, quiet: QuietHoursUtc): boolean {
  if (quiet.start === quiet.end) return false;
  if (quiet.start < quiet.end) return hourUtc >= quiet.start && hourUtc < quiet.end;
  return hourUtc >= quiet.start || hourUtc < quiet.end;
}

export function decideProactiveAsk(
  input: ProactiveGateInput,
): { ok: true } | { ok: false; reason: ProactiveSkipReason } {
  if (!input.visible) return { ok: false, reason: 'hidden' };
  if (!input.hasSession) return { ok: false, reason: 'no-session' };
  if (!input.enabled) return { ok: false, reason: 'disabled' };
  if (input.maxSuggestionsPerDay <= 0) return { ok: false, reason: 'zero-cap' };
  if (isQuietHour(utcHour(input.nowMs), input.quietHoursUtc)) return { ok: false, reason: 'quiet-hours' };
  if (input.existingSuggestionId) return { ok: false, reason: 'deduped' };
  if (input.asksToday >= input.maxSuggestionsPerDay) return { ok: false, reason: 'frequency-cap' };
  return { ok: true };
}

export function proactiveFromConfig(config: PubchiConfigV1 | null | undefined): PubchiConfigV1['proactive'] {
  return config?.proactive ?? { ...DEFAULT_PROACTIVE };
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function readDismissedIds(owner: string): string[] {
  const raw = storage()?.getItem(`${PROACTIVE_DISMISS_PREFIX}${owner}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}

export function isSuggestionDismissed(owner: string, suggestionId: string): boolean {
  return readDismissedIds(owner).includes(suggestionId);
}

export function persistDismissedId(owner: string, suggestionId: string): void {
  const store = storage();
  if (!store) return;
  const next = new Set(readDismissedIds(owner));
  next.add(suggestionId);
  store.setItem(`${PROACTIVE_DISMISS_PREFIX}${owner}`, JSON.stringify([...next]));
}

export type ProactiveAttemptState = { day: string; count: number };

export function readAttemptState(owner: string, nowMs: number): ProactiveAttemptState {
  const day = utcDayKey(nowMs);
  const raw = storage()?.getItem(`${PROACTIVE_ATTEMPT_PREFIX}${owner}`);
  if (!raw) return { day, count: 0 };
  try {
    const parsed = JSON.parse(raw) as { day?: unknown; count?: unknown };
    if (parsed.day !== day || typeof parsed.count !== 'number' || parsed.count < 0) return { day, count: 0 };
    return { day, count: Math.floor(parsed.count) };
  } catch {
    return { day, count: 0 };
  }
}

export function recordProactiveAttempt(owner: string, nowMs: number): ProactiveAttemptState {
  const current = readAttemptState(owner, nowMs);
  const next = { day: current.day, count: current.count + 1 };
  storage()?.setItem(`${PROACTIVE_ATTEMPT_PREFIX}${owner}`, JSON.stringify(next));
  return next;
}

/** Owner cleanup preserves other accounts and the origin-wide fallback lock. */
export function clearProactiveLocalState(owner?: string): void {
  const store = storage();
  if (!store) return;
  const keys: string[] = [];
  for (let index = store.length - 1; index >= 0; index -= 1) {
    const key = store.key(index);
    if (!key) continue;
    if (owner !== undefined) {
      if (
        key === `${PROACTIVE_DISMISS_PREFIX}${owner}` ||
        key === `${PROACTIVE_ATTEMPT_PREFIX}${owner}` ||
        key.startsWith(`${PROACTIVE_CLAIM_PREFIX}${owner}:`)
      ) {
        keys.push(key);
      }
      continue;
    }
    if (
      key.startsWith(PROACTIVE_DISMISS_PREFIX) ||
      key.startsWith(PROACTIVE_ATTEMPT_PREFIX) ||
      key.startsWith(PROACTIVE_CLAIM_PREFIX)
    ) {
      keys.push(key);
    }
  }
  for (const key of keys) store.removeItem(key);
}

export function isAppForeground(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

function utcAtHour(nowMs: number, hour: number, dayOffset = 0): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + dayOffset, hour, 0, 0, 0);
}

/** Next UTC instant that is outside quiet hours. Receiver clock. */
export function nextEligibleWindowMs(nowMs: number, quiet: QuietHoursUtc): number {
  if (!isQuietHour(utcHour(nowMs), quiet)) return nowMs;
  const endToday = utcAtHour(nowMs, quiet.end);
  return endToday > nowMs ? endToday : utcAtHour(nowMs, quiet.end, 1);
}

/** After a used cap unit, wait until the next UTC day that is outside quiet hours. */
export function nextCapResetMs(nowMs: number, quiet: QuietHoursUtc): number {
  return nextEligibleWindowMs(utcAtHour(nowMs, 0, 1), quiet);
}

export function visibleProactiveSuggestions<T extends { suggestion_id: string; expires_at: number }>(
  suggestions: T[],
  owner: string,
  nowSeconds: number,
): T[] {
  return suggestions.filter(
    (suggestion) => suggestion.expires_at > nowSeconds && !isSuggestionDismissed(owner, suggestion.suggestion_id),
  );
}
