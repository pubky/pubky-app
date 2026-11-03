import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimProactiveDay,
  clearProactiveLocalState,
  decideProactiveAsk,
  DEFAULT_PROACTIVE,
  hasProactiveDayClaim,
  isQuietHour,
  isSuggestionDismissed,
  nextCapResetMs,
  nextEligibleWindowMs,
  persistDismissedId,
  PROACTIVE_ATTEMPT_PREFIX,
  PROACTIVE_BUDGET_SHARE,
  PROACTIVE_CLAIM_PREFIX,
  PROACTIVE_DISMISS_PREFIX,
  PROACTIVE_PURPOSE,
  proactiveLockName,
  proactiveSuggestionId,
  readAttemptState,
  recordProactiveAttempt,
  setProactiveLocksForTests,
  utcDayKey,
  visibleProactiveSuggestions,
  withProactiveDayLock,
} from './proactive';
import { PHASE0_BUDGETS } from './schemas/tenant';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const noon = Date.UTC(2026, 8, 21, 12, 0, 0);
const quietHour = Date.UTC(2026, 8, 21, 23, 0, 0);
const baseGate = {
  enabled: true,
  maxSuggestionsPerDay: 1,
  quietHoursUtc: DEFAULT_PROACTIVE.quiet_hours_utc,
  nowMs: noon,
  visible: true,
  hasSession: true,
  asksToday: 0,
  existingSuggestionId: null as string | null,
};

describe('pubchi app-open proactive coordinator helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    setProactiveLocksForTests(undefined);
  });

  it('treats wrap-around quiet hours 22–7 UTC as quiet and 12:00 as eligible', () => {
    const quiet = DEFAULT_PROACTIVE.quiet_hours_utc;
    expect(isQuietHour(22, quiet)).toBe(true);
    expect(isQuietHour(6, quiet)).toBe(true);
    expect(isQuietHour(7, quiet)).toBe(false);
    expect(isQuietHour(12, quiet)).toBe(false);
    expect(isQuietHour(21, quiet)).toBe(false);
    expect(decideProactiveAsk({ ...baseGate, nowMs: quietHour })).toEqual({ ok: false, reason: 'quiet-hours' });
    expect(decideProactiveAsk(baseGate)).toEqual({ ok: true });
    expect(nextEligibleWindowMs(quietHour, quiet)).toBe(Date.UTC(2026, 8, 22, 7, 0, 0));
    expect(nextCapResetMs(noon, quiet)).toBe(Date.UTC(2026, 8, 22, 7, 0, 0));
  });

  it('caps asks per UTC day and dedupes an existing suggestion_id before a query', () => {
    expect(proactiveSuggestionId(noon)).toBe(`what-i-missed-${utcDayKey(noon)}`);
    expect(decideProactiveAsk({ ...baseGate, asksToday: 1 })).toEqual({ ok: false, reason: 'frequency-cap' });
    expect(decideProactiveAsk({ ...baseGate, existingSuggestionId: 'what-i-missed-20260921' })).toEqual({
      ok: false,
      reason: 'deduped',
    });
    expect(decideProactiveAsk({ ...baseGate, enabled: false })).toEqual({ ok: false, reason: 'disabled' });
    expect(decideProactiveAsk({ ...baseGate, visible: false })).toEqual({ ok: false, reason: 'hidden' });
    expect(decideProactiveAsk({ ...baseGate, hasSession: false })).toEqual({ ok: false, reason: 'no-session' });
    expect(decideProactiveAsk({ ...baseGate, maxSuggestionsPerDay: 0 })).toEqual({ ok: false, reason: 'zero-cap' });
  });

  it('counts each attempted ask against the shared owner token pool contract', () => {
    expect(PROACTIVE_BUDGET_SHARE).toEqual({
      hosted_proactive_suggestions_per_day: PHASE0_BUDGETS.proactive_suggestions_per_day,
      query_path: '/v1/query',
      purpose: PROACTIVE_PURPOSE,
      owner_hourly_tokens: PHASE0_BUDGETS.per_owner_hourly_tokens,
      owner_utc_day_tokens: PHASE0_BUDGETS.per_owner_utc_day_tokens,
      per_request_input_tokens: PHASE0_BUDGETS.per_request_input_tokens,
      per_request_output_tokens: PHASE0_BUDGETS.per_request_output_tokens,
    });
    expect(PROACTIVE_BUDGET_SHARE.hosted_proactive_suggestions_per_day).toBe(0);
    expect(recordProactiveAttempt(OWNER, noon)).toEqual({ day: utcDayKey(noon), count: 1 });
    expect(readAttemptState(OWNER, noon).count).toBe(1);
    expect(decideProactiveAsk({ ...baseGate, asksToday: readAttemptState(OWNER, noon).count })).toEqual({
      ok: false,
      reason: 'frequency-cap',
    });
    expect(readAttemptState(OWNER, Date.UTC(2026, 8, 22, 12, 0, 0)).count).toBe(0);
  });

  it('persists dismiss locally and clears it on sign-out', () => {
    persistDismissedId(OWNER, 'what-i-missed-20260921');
    expect(isSuggestionDismissed(OWNER, 'what-i-missed-20260921')).toBe(true);
    expect(
      visibleProactiveSuggestions(
        [{ suggestion_id: 'what-i-missed-20260921', expires_at: nowSecondsFrom(noon) + 10 }],
        OWNER,
        nowSecondsFrom(noon),
      ),
    ).toEqual([]);
    expect(localStorage.getItem(`${PROACTIVE_DISMISS_PREFIX}${OWNER}`)).toContain('what-i-missed-20260921');
    clearProactiveLocalState();
    expect(localStorage.getItem(`${PROACTIVE_DISMISS_PREFIX}${OWNER}`)).toBeNull();
    expect(localStorage.getItem(`${PROACTIVE_ATTEMPT_PREFIX}${OWNER}`)).toBeNull();
    expect(isSuggestionDismissed(OWNER, 'what-i-missed-20260921')).toBe(false);
  });

  it('clears only an outgoing owner and preserves another account and origin-wide lock', () => {
    const otherOwner = `${OWNER}other`;
    for (const owner of [OWNER, otherOwner]) {
      persistDismissedId(owner, 'suggestion');
      recordProactiveAttempt(owner, noon);
      claimProactiveDay(owner, noon);
    }
    const lockKey = `${PROACTIVE_CLAIM_PREFIX}lock:${utcDayKey(noon)}`;
    localStorage.setItem(lockKey, '1');
    localStorage.setItem('unrelated', 'keep');

    clearProactiveLocalState(OWNER);

    expect(isSuggestionDismissed(OWNER, 'suggestion')).toBe(false);
    expect(readAttemptState(OWNER, noon).count).toBe(0);
    expect(hasProactiveDayClaim(OWNER, noon)).toBe(false);
    expect(isSuggestionDismissed(otherOwner, 'suggestion')).toBe(true);
    expect(readAttemptState(otherOwner, noon).count).toBe(1);
    expect(hasProactiveDayClaim(otherOwner, noon)).toBe(true);
    expect(localStorage.getItem(lockKey)).toBe('1');
    expect(localStorage.getItem('unrelated')).toBe('keep');
  });

  it('names the Web Lock pubchi-proactive-YYYYMMDD and skips a second ifAvailable waiter', async () => {
    expect(proactiveLockName(noon)).toBe(`pubchi-proactive-${utcDayKey(noon)}`);
    expect(claimProactiveDay(OWNER, noon)).toBe(true);
    expect(claimProactiveDay(OWNER, noon)).toBe(false);
    expect(hasProactiveDayClaim(OWNER, noon)).toBe(true);

    const held = new Set<string>();
    setProactiveLocksForTests({
      request: async (name, _options, callback) => {
        if (held.has(name)) return callback(null);
        held.add(name);
        try {
          return await callback({ name });
        } finally {
          held.delete(name);
        }
      },
    });

    let releaseHolder: () => void = () => undefined;
    const hold = new Promise<void>((resolve) => {
      releaseHolder = resolve;
    });
    const first = withProactiveDayLock(noon, async () => {
      await hold;
      return 'one';
    });
    await vi.waitFor(() => expect(held.size).toBe(1));
    const second = await withProactiveDayLock(noon, async () => 'two');
    expect(second).toEqual({ acquired: false });
    releaseHolder();
    await expect(first).resolves.toEqual({ acquired: true, value: 'one' });

    setProactiveLocksForTests(null);
    localStorage.clear();
    const fallbackFirst = await withProactiveDayLock(noon, async () => 'claimed');
    const fallbackSecond = await withProactiveDayLock(noon, async () => 'lost');
    expect(fallbackFirst).toEqual({ acquired: true, value: 'claimed' });
    expect(fallbackSecond).toEqual({ acquired: false });
    expect(localStorage.getItem(`${PROACTIVE_CLAIM_PREFIX}lock:${utcDayKey(noon)}`)).toBe('1');
    clearProactiveLocalState();
    expect(localStorage.getItem(`${PROACTIVE_CLAIM_PREFIX}lock:${utcDayKey(noon)}`)).toBeNull();
  });
});

function nowSecondsFrom(nowMs: number): number {
  return Math.floor(nowMs / 1000);
}
