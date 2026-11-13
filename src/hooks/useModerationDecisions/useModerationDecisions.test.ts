import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getModerationDecisionsUrl } from '@/config/moderation';
import { ModerationDecisionController } from '@/controllers/moderation-decision/moderation-decision';
import { useAuthStore } from '@/stores/auth/auth.store';
import { authInitialState } from '@/stores/auth/auth.types';
import { useModerationDecisionStore } from '@/stores/moderationDecision/moderationDecision.store';
import { moderationDecisionInitialState } from '@/stores/moderationDecision/moderationDecision.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { useModerationDecisions } from './useModerationDecisions';

vi.mock('@/config/moderation', () => ({ getModerationDecisionsUrl: vi.fn() }));
vi.mock('@/controllers/moderation-decision/moderation-decision', () => ({
  ModerationDecisionController: { fetchDecisions: vi.fn() },
}));

const ALICE = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
const BOB = '8um71us3fyw6h8wbcxb5ar3rwusy1a6u49956ikzojg3gcwd1dty';

const signIn = (pubky: string) =>
  act(() =>
    useAuthStore.setState({
      currentUserPubky: pubky,
      session: asOpaque<NonNullable<typeof authInitialState.session>>({}),
    }),
  );

describe('useModerationDecisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getModerationDecisionsUrl).mockReturnValue('https://moderation.example');
    vi.mocked(ModerationDecisionController.fetchDecisions).mockResolvedValue();
    act(() => useAuthStore.setState(authInitialState));
    act(() => useModerationDecisionStore.setState(moderationDecisionInitialState));
  });

  afterEach(() => {
    cleanup();
    act(() => useAuthStore.setState(authInitialState));
  });

  it('asks for the signed-in user’s statements', () => {
    signIn(ALICE);

    renderHook(() => useModerationDecisions());

    expect(ModerationDecisionController.fetchDecisions).toHaveBeenCalledWith(ALICE);
  });

  it('asks nothing when no moderation service is configured', () => {
    vi.mocked(getModerationDecisionsUrl).mockReturnValue(undefined);
    signIn(ALICE);

    const { result } = renderHook(() => useModerationDecisions());

    expect(ModerationDecisionController.fetchDecisions).not.toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('asks nothing without a session', () => {
    act(() => useAuthStore.setState({ currentUserPubky: ALICE, session: null }));

    renderHook(() => useModerationDecisions());

    expect(ModerationDecisionController.fetchDecisions).not.toHaveBeenCalled();
  });

  it('returns the statements read for this user and none read for another', () => {
    signIn(ALICE);
    act(() => useModerationDecisionStore.getState().markReady(ALICE, [null], 1000));
    const { result } = renderHook(() => useModerationDecisions());
    expect(result.current).toEqual([null]);

    signIn(BOB);

    expect(result.current).toEqual([]);
    expect(ModerationDecisionController.fetchDecisions).toHaveBeenLastCalledWith(BOB);
  });

  it('returns nothing after sign-out', () => {
    signIn(ALICE);
    act(() => useModerationDecisionStore.getState().markReady(ALICE, [null], 1000));
    const { result } = renderHook(() => useModerationDecisions());

    act(() => useAuthStore.setState({ currentUserPubky: null, session: null }));

    expect(result.current).toEqual([]);
  });
});
