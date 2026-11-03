import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import type { FeedProposalV1 } from '@/libs/pubchi/schemas/feed';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { usePubchiQuery } from './usePubchiQuery';
import { QUERY_FORM_FIELDS } from './usePubchiQuery.types';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const FEED_PROPOSAL: FeedProposalV1 = {
  schema: 'pubchi-feed-proposal' as const,
  version: 1 as const,
  bot: OWNER,
  owner: OWNER,
  generated_at: 10,
  feed: {
    name: 'Builders',
    created_at: 10,
    feed: {
      tags: ['builder'],
      reach: 'following' as const,
      layout: 'columns' as const,
      sort: 'recent' as const,
    },
  },
  warnings: [] as [],
  installed_user_feed_id: null,
};

const FEED_SUCCESS: PubchiQuerySuccess = {
  kind: 'feed',
  result: FEED_PROPOSAL,
  applyAllowed: true,
};

function answer(
  overrides: Partial<{ owner: string; complete: boolean; until: string; continuation: boolean }> = {},
): PubchiQuerySuccess {
  const { owner = 'a'.repeat(52), complete = true, until = '2026-09-10T07:00:00Z', continuation = true } = overrides;
  return {
    kind: 'answer',
    result: {
      schema: 'pubchi-answer',
      version: 1,
      bot: OWNER,
      owner,
      generated_at: 10,
      run_id: 'answer-1',
      purpose: 'ask',
      question: 'What did I miss?',
      summary: 'Nothing.',
      evidence: [],
      sources: [],
      tool_trace_summary: { tools: [], call_count: 0, truncated: false },
      policy_version: 1,
      ...(continuation
        ? {
            continuation: {
              since: '2026-09-10T06:00:00Z',
              until,
              complete,
              skipped: 0,
            },
          }
        : {}),
    },
  } as PubchiQuerySuccess;
}

const mocks = vi.hoisted(() => ({
  fetchPubchiQuery: vi.fn(),
  toast: vi.fn(),
  ensureDeviceReady: vi.fn(),
  loadPubchi: vi.fn(),
  loadPubchiCursor: vi.fn(),
  savePubchiCursor: vi.fn(),
  sessionCapabilities: [] as string[],
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    fetchPubchiQuery: (...args: unknown[]) => mocks.fetchPubchiQuery(...args),
    ensureDeviceReady: (...args: unknown[]) => mocks.ensureDeviceReady(...args),
    loadPubchi: (...args: unknown[]) => mocks.loadPubchi(...args),
    loadPubchiCursor: (...args: unknown[]) => mocks.loadPubchiCursor(...args),
    savePubchiCursor: (...args: unknown[]) => mocks.savePubchiCursor(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: 'a'.repeat(52) }),
    {
      getState: () => ({
        currentUserPubky: 'a'.repeat(52),
        selectSession: () => ({ info: { capabilities: mocks.sessionCapabilities } }),
      }),
    },
  ),
}));

describe('usePubchiQuery', () => {
  beforeEach(() => {
    usePubchiStore.getState().clear();
    mocks.fetchPubchiQuery.mockReset();
    mocks.toast.mockReset();
    mocks.fetchPubchiQuery.mockResolvedValue(FEED_SUCCESS);
    mocks.ensureDeviceReady.mockReset().mockResolvedValue(true);
    mocks.loadPubchi.mockReset().mockResolvedValue({ verified: true });
    mocks.loadPubchiCursor.mockReset().mockResolvedValue(null);
    mocks.savePubchiCursor.mockReset().mockResolvedValue(undefined);
    mocks.sessionCapabilities = [];
    localStorage.clear();
  });

  afterEach(() => {
    resetRuntimeConfigForTests();
    vi.clearAllMocks();
  });

  it('passes an explicit purpose through to the controller', async () => {
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'build a feed of builders');
      await result.current.submit('build-feed');
    });

    expect(mocks.fetchPubchiQuery).toHaveBeenCalledWith({
      question: 'build a feed of builders',
      purpose: 'build-feed',
      proposalVersion: 2,
    });
    expect(result.current.result).toEqual(FEED_SUCCESS);
    expect(result.current.errorCode).toBeUndefined();
  });

  it('does not toast SIGNATURE_INVALID when no device key is available', async () => {
    mocks.ensureDeviceReady.mockResolvedValue(false);
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(mocks.ensureDeviceReady).toHaveBeenCalledOnce());

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'who tagged me?');
      await result.current.submit('who-tagged-me');
    });

    expect(mocks.fetchPubchiQuery).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.current.signingAvailable).toBe(false);
    expect(result.current.signingUnavailableMessage).toBe(
      "This browser isn't set up for Pubchi yet. Set it up to start asking.",
    );
    expect(result.current.errorCode).toBe("This browser isn't set up for Pubchi yet. Set it up to start asking.");
  });

  it('does not set up a device when the owner has no Pubchi', async () => {
    mocks.loadPubchi.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiQuery());

    await waitFor(() => expect(result.current.pubchiAvailable).toBe(false));

    expect(mocks.ensureDeviceReady).not.toHaveBeenCalled();
    expect(result.current.signingAvailable).toBe(false);
  });

  it('surfaces the schema message when a question is missing', async () => {
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    void result.current.form.formState.errors;
    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, '   ');
      await expect(result.current.submit('who-tagged-me')).resolves.toBe(false);
    });

    expect(mocks.fetchPubchiQuery).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors[QUERY_FORM_FIELDS.QUESTION]?.message).toBe('Enter a question.');
  });

  it('advances the local cursor only for a complete answer', async () => {
    mocks.fetchPubchiQuery.mockResolvedValue(answer());
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });

    expect(localStorage.getItem(`pubchi-cursor:${'a'.repeat(52)}`)).toBe('2026-09-10T07:00:00Z');
  });

  it.each([
    ['a partial answer', answer({ complete: false })],
    ['an answer without continuation', answer({ continuation: false })],
  ])('does not advance the cursor for %s', async (_label, response) => {
    mocks.fetchPubchiQuery.mockResolvedValue(response);
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });

    expect(localStorage.length).toBe(0);
  });

  it('does not advance the cursor for a different question', async () => {
    mocks.fetchPubchiQuery.mockResolvedValue(answer());
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What changed?');
      await result.current.submit('ask');
    });

    expect(localStorage.length).toBe(0);
  });

  it('does not advance the cursor when the query errors', async () => {
    mocks.fetchPubchiQuery.mockRejectedValue(new Error('failed'));
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });

    expect(localStorage.length).toBe(0);
  });

  it('does not advance for a foreign-owner answer or regress an older cursor', async () => {
    localStorage.setItem(`pubchi-cursor:${'a'.repeat(52)}`, '2026-09-10T08:00:00Z');
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    mocks.fetchPubchiQuery.mockResolvedValue(answer({ owner: 'b'.repeat(52), until: '2026-09-10T09:00:00Z' }));
    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });
    expect(localStorage.getItem(`pubchi-cursor:${'a'.repeat(52)}`)).toBe('2026-09-10T08:00:00Z');

    mocks.fetchPubchiQuery.mockResolvedValue(answer({ until: '2026-09-10T07:00:00Z' }));
    await act(async () => {
      await result.current.submit('ask');
    });
    expect(localStorage.getItem(`pubchi-cursor:${'a'.repeat(52)}`)).toBe('2026-09-10T08:00:00Z');
  });

  it('compares offset cursors by instant rather than string order', async () => {
    localStorage.setItem(`pubchi-cursor:${'a'.repeat(52)}`, '2026-09-10T08:00:00+01:00');
    mocks.fetchPubchiQuery.mockResolvedValue(answer({ until: '2026-09-10T07:30:00Z' }));
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });

    expect(localStorage.getItem(`pubchi-cursor:${'a'.repeat(52)}`)).toBe('2026-09-10T07:30:00Z');
  });

  it('writes the cursor remotely when the session covers the private directory', async () => {
    mocks.sessionCapabilities = ['/priv/app.pubchi/v1/:rw'];
    mocks.fetchPubchiQuery.mockResolvedValue(answer());
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });

    expect(mocks.savePubchiCursor).toHaveBeenCalledWith('a'.repeat(52), '2026-09-10T07:00:00Z');
    expect(localStorage.length).toBe(0);
  });

  it('keeps the answer and shows one warning when saving the cursor fails', async () => {
    mocks.sessionCapabilities = ['/priv/app.pubchi/v1/:rw'];
    mocks.fetchPubchiQuery.mockResolvedValue(answer());
    mocks.savePubchiCursor.mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'What did I miss?');
      await result.current.submit('ask');
    });

    expect(result.current.result).toEqual(answer());
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'warning',
      title: "Answer shown; couldn't save your catch-up position",
      dismissButton: true,
    });
  });

  it('discards an in-flight summarize when a later post-menu summarize starts', async () => {
    const owner = 'a'.repeat(52);
    usePubchiStore.getState().setConfig(null, owner);
    const targetA = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-A' };
    const targetB = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-B' };
    const questionA = `Summarize this thread ${targetA.uri}`;
    const questionB = `Summarize this thread ${targetB.uri}`;
    const summarizeAnswer = (question: string, summary: string): PubchiQuerySuccess => {
      const base = answer({ owner, continuation: false });
      if (base.kind !== 'answer') throw new Error('expected answer');
      return { ...base, result: { ...base.result, question, summary } };
    };
    const answerA = summarizeAnswer(questionA, 'Summary A');
    const answerB = summarizeAnswer(questionB, 'Summary B');
    let resolveA!: (value: PubchiQuerySuccess) => void;
    let resolveB!: (value: PubchiQuerySuccess) => void;
    mocks.fetchPubchiQuery
      .mockImplementationOnce(
        () =>
          new Promise<PubchiQuerySuccess>((resolve) => {
            resolveA = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PubchiQuerySuccess>((resolve) => {
            resolveB = resolve;
          }),
      );

    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, questionA);
      void result.current.submit('ask', { target: targetA });
    });
    await waitFor(() => expect(result.current.loading).toBe(true));

    await act(async () => {
      usePubchiStore.getState().openFlyout({ question: questionB, source: 'post-menu', target: targetB }, owner);
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, questionB);
      void result.current.submit('ask', { target: targetB });
    });

    await act(async () => {
      resolveA(answerA);
    });
    expect(result.current.result).toBeUndefined();
    expect(usePubchiStore.getState().conversation.turns).toEqual([]);
    expect(mocks.toast).not.toHaveBeenCalled();

    await act(async () => {
      resolveB(answerB);
    });
    await waitFor(() => expect(result.current.result).toEqual(answerB));
    expect(usePubchiStore.getState().conversation.turns.map((turn) => turn.text)).toEqual([questionB, 'Summary B']);
  });
});
