import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModerationDecisionApplication } from '@/application/moderation-decision/moderation-decision';
import type { TModerationDecision } from '@/services/moderation-decision/moderation-decision.types';
import { useModerationDecisionStore } from '@/stores/moderationDecision/moderationDecision.store';
import { moderationDecisionInitialState } from '@/stores/moderationDecision/moderationDecision.types';
import { MODERATION_DECISION_FRESH_MS, ModerationDecisionController } from './moderation-decision';

vi.mock('@/application/moderation-decision/moderation-decision', () => ({
  ModerationDecisionApplication: { fetchDecisions: vi.fn() },
}));

const ALICE = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
const BOB = '8um71us3fyw6h8wbcxb5ar3rwusy1a6u49956ikzojg3gcwd1dty';

const decision: TModerationDecision = {
  id: '481d54f9-bdbf-83f3-9ec3-39ffc2891179',
  restriction: 'content_removed',
  targetUri: `pubky://${ALICE}/pub/pubky.app/posts/0035Z5M4Q4ZJR`,
  territorialScope: 'Everywhere pubky.app is offered',
  endsAt: null,
  decidedAt: '2026-11-06T07:25:36Z',
  basis: 'own_initiative',
  facts: 'The content was identified as personal information content.',
  automatedDetection: true,
  automatedDecision: false,
  automatedMeans: 'Detected automatically; a person decided.',
  ground: 'terms',
  groundReference: 'Pubky Terms of Service, Community Guidelines',
  explanation: 'The Community Guidelines do not allow it.',
};

describe('ModerationDecisionController.fetchDecisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-06T08:00:00Z'));
    useModerationDecisionStore.setState(moderationDecisionInitialState);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores the statements the service returns for the user', async () => {
    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockResolvedValue({
      status: 'ready',
      decisions: [decision, null],
    });

    await ModerationDecisionController.fetchDecisions(ALICE);

    expect(useModerationDecisionStore.getState()).toMatchObject({
      status: 'ready',
      forPubky: ALICE,
      decisions: [decision, null],
      settledAt: Date.now(),
    });
  });

  it('marks the read failed when the service is unavailable', async () => {
    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockResolvedValue({ status: 'unavailable' });

    await ModerationDecisionController.fetchDecisions(ALICE);

    expect(useModerationDecisionStore.getState()).toMatchObject({ status: 'failed', forPubky: ALICE, decisions: [] });
  });

  it('does not ask again while a read is in flight', async () => {
    let finish: (value: { status: 'unavailable' }) => void = () => {};
    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );

    const first = ModerationDecisionController.fetchDecisions(ALICE);
    await ModerationDecisionController.fetchDecisions(ALICE);
    finish({ status: 'unavailable' });
    await first;

    expect(ModerationDecisionApplication.fetchDecisions).toHaveBeenCalledTimes(1);
  });

  it('reuses a read for a minute, successful or not, then asks again', async () => {
    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockResolvedValue({ status: 'ready', decisions: [] });

    await ModerationDecisionController.fetchDecisions(ALICE);
    vi.advanceTimersByTime(MODERATION_DECISION_FRESH_MS - 1);
    await ModerationDecisionController.fetchDecisions(ALICE);
    expect(ModerationDecisionApplication.fetchDecisions).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await ModerationDecisionController.fetchDecisions(ALICE);
    expect(ModerationDecisionApplication.fetchDecisions).toHaveBeenCalledTimes(2);
  });

  it('keeps the earlier statements when a refresh fails', async () => {
    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockResolvedValueOnce({
      status: 'ready',
      decisions: [decision],
    });
    await ModerationDecisionController.fetchDecisions(ALICE);
    vi.advanceTimersByTime(MODERATION_DECISION_FRESH_MS);

    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockResolvedValueOnce({ status: 'unavailable' });
    await ModerationDecisionController.fetchDecisions(ALICE);

    expect(useModerationDecisionStore.getState()).toMatchObject({ status: 'failed', decisions: [decision] });
  });

  it('reads for a different user straight away', async () => {
    vi.mocked(ModerationDecisionApplication.fetchDecisions).mockResolvedValue({ status: 'ready', decisions: [] });

    await ModerationDecisionController.fetchDecisions(ALICE);
    await ModerationDecisionController.fetchDecisions(BOB);

    expect(ModerationDecisionApplication.fetchDecisions).toHaveBeenCalledTimes(2);
    expect(useModerationDecisionStore.getState().forPubky).toBe(BOB);
  });

  it('drops a read that settles after another user took over', async () => {
    let finish: (value: { status: 'ready'; decisions: TModerationDecision[] }) => void = () => {};
    vi.mocked(ModerationDecisionApplication.fetchDecisions)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      )
      .mockResolvedValueOnce({ status: 'ready', decisions: [] });

    const alice = ModerationDecisionController.fetchDecisions(ALICE);
    await ModerationDecisionController.fetchDecisions(BOB);
    finish({ status: 'ready', decisions: [decision] });
    await alice;

    expect(useModerationDecisionStore.getState()).toMatchObject({ forPubky: BOB, status: 'ready', decisions: [] });
  });

  it('lets only the latest read commit, so an older one settling late cannot overwrite it', async () => {
    let finishFirst: (value: { status: 'ready'; decisions: TModerationDecision[] }) => void = () => {};
    vi.mocked(ModerationDecisionApplication.fetchDecisions)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockResolvedValueOnce({ status: 'ready', decisions: [] })
      .mockResolvedValueOnce({ status: 'ready', decisions: [null] });

    const first = ModerationDecisionController.fetchDecisions(ALICE);
    await ModerationDecisionController.fetchDecisions(BOB);
    await ModerationDecisionController.fetchDecisions(ALICE);
    expect(useModerationDecisionStore.getState().decisions).toEqual([null]);

    finishFirst({ status: 'ready', decisions: [decision] });
    await first;

    expect(useModerationDecisionStore.getState()).toMatchObject({ forPubky: ALICE, decisions: [null] });
  });
});
