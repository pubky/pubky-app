import { beforeEach, describe, expect, it } from 'vitest';
import { useModerationDecisionStore } from './moderationDecision.store';
import { moderationDecisionInitialState } from './moderationDecision.types';

const ALICE = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
const BOB = '8um71us3fyw6h8wbcxb5ar3rwusy1a6u49956ikzojg3gcwd1dty';

describe('useModerationDecisionStore', () => {
  beforeEach(() => {
    useModerationDecisionStore.setState(moderationDecisionInitialState);
  });

  it('starts idle with no statements', () => {
    expect(useModerationDecisionStore.getState()).toMatchObject({
      status: 'idle',
      forPubky: null,
      decisions: [],
      settledAt: 0,
    });
  });

  it('moves loading, then ready with the statements and when they settled', () => {
    useModerationDecisionStore.getState().markLoading(ALICE);
    expect(useModerationDecisionStore.getState()).toMatchObject({ status: 'loading', forPubky: ALICE });

    useModerationDecisionStore.getState().markReady(ALICE, [null], 1000);
    expect(useModerationDecisionStore.getState()).toMatchObject({
      status: 'ready',
      forPubky: ALICE,
      decisions: [null],
      settledAt: 1000,
    });
  });

  it('keeps the statements on screen while the same user refreshes, and after a failed refresh', () => {
    useModerationDecisionStore.getState().markReady(ALICE, [null], 1000);

    useModerationDecisionStore.getState().markLoading(ALICE);
    expect(useModerationDecisionStore.getState().decisions).toEqual([null]);

    useModerationDecisionStore.getState().markFailed(ALICE, 2000);
    expect(useModerationDecisionStore.getState()).toMatchObject({
      status: 'failed',
      decisions: [null],
      settledAt: 2000,
    });
  });

  it('never carries one user’s statements to another', () => {
    useModerationDecisionStore.getState().markReady(ALICE, [null], 1000);

    useModerationDecisionStore.getState().markLoading(BOB);
    expect(useModerationDecisionStore.getState()).toMatchObject({ forPubky: BOB, decisions: [] });

    useModerationDecisionStore.getState().markReady(ALICE, [null], 3000);
    useModerationDecisionStore.getState().markFailed(BOB, 4000);
    expect(useModerationDecisionStore.getState()).toMatchObject({ forPubky: BOB, decisions: [] });
  });
});
