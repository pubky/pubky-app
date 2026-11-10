import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { mockRingSession } from '@/test-utils/pubky';
import { PubchiPanel } from './PubchiPanel';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const TARGET = { kind: 'post' as const, uri: `pubky://${OWNER}/pub/pubky.app/posts/POST123456789` };
const QUESTION = 'Summarize this thread';
const beforeProposal: FeedProposalV2 = {
  schema: 'pubchi-feed-proposal',
  version: 2,
  bot: OWNER,
  owner: OWNER,
  generated_at: 1,
  mode: 'create',
  target_feed_id: null,
  feed: {
    name: 'Before',
    icon: 'rss',
    feed: { reach: 'following', sort: 'recent', layout: 'columns', tags: ['old'], domain_tags: [] },
  },
  mapping: { status: 'exact', unmapped: [] },
  warnings: [],
  installed_user_feed_id: null,
};
const afterProposal: FeedProposalV2 = {
  ...beforeProposal,
  generated_at: 2,
  feed: {
    name: 'After',
    icon: 'rss',
    feed: { reach: 'all', sort: 'popularity', layout: 'wide', tags: ['new'], domain_tags: [] },
  },
};
const answer: PubchiQuerySuccess = {
  kind: 'answer',
  result: {
    schema: 'pubchi-answer',
    version: 1,
    bot: OWNER,
    owner: OWNER,
    generated_at: 1,
    run_id: 'summary',
    purpose: 'ask',
    question: QUESTION,
    summary: 'The thread discusses feeds.',
    evidence: [],
    sources: [],
    tool_trace_summary: { tools: [], call_count: 0, truncated: false },
    policy_version: 1,
  },
};

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/libs/pubchi/flags', () => ({ isPubchiPanelEnabled: () => true, isPubchiEnabled: () => true }));
vi.mock('@/controllers/pubchi/pubchi-sync', () => ({ publishPubchiSync: vi.fn() }));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ waitForAuth: async () => true }),
}));
vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => ({
    needsReapproval: false,
    reapprove: vi.fn(),
    loading: false,
    pubchi: { bot: OWNER, displayName: 'Helper', verified: true },
  }),
}));
vi.mock('@/hooks/useDiscoveredTagSuggestions/useDiscoveredTagSuggestions', () => ({
  useDiscoveredTagSuggestions: () => ({ suggestions: [], revert: vi.fn(), reconcile: vi.fn() }),
}));
vi.mock('@/hooks/useTagSuggestions/useTagSuggestions', () => ({
  useTagSuggestions: () => ({ suggestions: [] }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function PanelHarness() {
  const open = usePubchiStore((state) => state.flyout.open);
  return (
    <TooltipProvider>
      <PubchiPanel open={open} onOpenChange={(nextOpen) => !nextOpen && PubchiController.closeFlyout()} />
    </TooltipProvider>
  );
}

async function renderReadyBuilder(proposal = beforeProposal) {
  usePubchiStore.getState().openFeedBuilder(proposal);
  render(<PanelHarness />);
  // Flush the real query hook's asynchronous device preparation before Interpret.
  await act(async () => {});
}

async function interpret() {
  fireEvent.change(screen.getByTestId('pubchi-feed-interpret-input'), { target: { value: 'Use the new settings' } });
  fireEvent.click(screen.getByRole('button', { name: 'Interpret' }));
  await waitFor(() => expect(PubchiController.fetchPubchiQuery).toHaveBeenCalled());
  expect(screen.getByTestId('save-feed-button')).toBeDisabled();
}

beforeEach(() => {
  usePubchiStore.getState().clear();
  usePubchiStore.getState().setConfig(null, OWNER);
  useAuthStore.setState({ currentUserPubky: OWNER, session: mockRingSession(['/:rw'], OWNER) });
  vi.spyOn(PubchiController, 'loadPubchi').mockResolvedValue({
    bot: OWNER,
    displayName: 'Helper',
    createdAt: 1,
    backupConfirmedAt: 1,
    verified: true,
  });
  vi.spyOn(PubchiController, 'ensureDeviceReady').mockResolvedValue(true);
  vi.spyOn(PubchiController, 'fetchPubchiQuery').mockResolvedValue(answer);
  vi.spyOn(PubchiController, 'commitRecordBuiltFeed').mockResolvedValue(true);
  vi.spyOn(StreamPostsController, 'getLocalStream').mockResolvedValue(null);
  vi.spyOn(FeedController, 'commitCreate').mockImplementation(async (data) => ({
    ...data,
    id: 'saved-feed',
    created_at: 1,
    updated_at: 1,
  }));
});

afterEach(() => vi.restoreAllMocks());

describe('PubchiPanel feed interpretation with the real dialog and form', () => {
  it.each(['empty', 'edited'] as const)(
    'replaces the %s draft and saves the accepted proposal values',
    async (seed) => {
      const response = deferred<PubchiQuerySuccess>();
      vi.mocked(PubchiController.fetchPubchiQuery).mockReturnValue(response.promise);
      await renderReadyBuilder(
        seed === 'empty'
          ? {
              ...beforeProposal,
              feed: { ...beforeProposal.feed, name: 'New feed', feed: { ...beforeProposal.feed.feed, tags: [] } },
            }
          : beforeProposal,
      );
      if (seed === 'edited') {
        fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'My edits' } });
      }
      await interpret();
      await act(async () => response.resolve({ kind: 'feed-v2', applyAllowed: false, result: afterProposal }));

      expect(screen.getByTestId('feed-name-input')).toHaveValue('After');
      expect(screen.getByText('new')).toBeInTheDocument();
      expect(screen.queryByText('old')).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('save-feed-button')).not.toBeDisabled());
      fireEvent.click(screen.getByTestId('save-feed-button'));

      await waitFor(() =>
        expect(FeedController.commitCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'After',
            tags: ['new'],
            reach: PubkyAppFeedReach.All,
            sort: PubkyAppFeedSort.Popularity,
            layout: PubkyAppFeedLayout.Wide,
          }),
        ),
      );
      expect(PubchiController.commitRecordBuiltFeed).toHaveBeenCalledWith(
        expect.objectContaining({ proposal: afterProposal }),
      );
    },
  );

  it('re-seeds an edited form when a second successful interpretation returns identical proposal data', async () => {
    await renderReadyBuilder();
    vi.mocked(PubchiController.fetchPubchiQuery).mockResolvedValue({
      kind: 'feed-v2',
      applyAllowed: false,
      result: afterProposal,
    });
    fireEvent.change(screen.getByTestId('pubchi-feed-interpret-input'), { target: { value: 'Use the new settings' } });
    fireEvent.click(screen.getByRole('button', { name: 'Interpret' }));
    await waitFor(() => expect(screen.getByTestId('feed-name-input')).toHaveValue('After'));
    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Manual change' } });
    vi.mocked(PubchiController.fetchPubchiQuery).mockResolvedValue({
      kind: 'feed-v2',
      applyAllowed: false,
      result: structuredClone(afterProposal),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Interpret' }));
    await waitFor(() => expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('feed-name-input')).toHaveValue('After'));
  });

  it.each(['failure', 'v1'] as const)('preserves edited form values after a %s interpretation', async (outcome) => {
    const response = deferred<PubchiQuerySuccess>();
    vi.mocked(PubchiController.fetchPubchiQuery).mockReturnValue(response.promise);
    await renderReadyBuilder();
    fireEvent.change(screen.getByTestId('feed-name-input'), { target: { value: 'Keep my edits' } });
    await interpret();
    await act(async () => {
      if (outcome === 'failure') response.reject(new TypeError('Failed to fetch'));
      else
        response.resolve({
          kind: 'feed',
          applyAllowed: true,
          result: {
            schema: 'pubchi-feed-proposal',
            version: 1,
            owner: OWNER,
            bot: OWNER,
            generated_at: 2,
            feed: { name: 'Legacy', created_at: 1, feed: { reach: 'all', sort: 'recent', layout: 'wide' } },
            warnings: [],
            installed_user_feed_id: null,
          },
        });
    });
    expect(screen.getByTestId('feed-name-input')).toHaveValue('Keep my edits');
    expect(screen.getByText('old')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-feed-interpret-input')).toHaveValue('Use the new settings');
    await waitFor(() => expect(screen.getByTestId('save-feed-button')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('save-feed-button'));
    await waitFor(() =>
      expect(FeedController.commitCreate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Keep my edits', tags: ['old'] }),
      ),
    );
    expect(PubchiController.commitRecordBuiltFeed).toHaveBeenCalledWith(
      expect.objectContaining({ proposal: beforeProposal }),
    );
  });
});

describe('PubchiPanel contextual summary readiness', () => {
  it('retains a fresh post-menu action until signing is ready and submits it exactly once', async () => {
    const ready = deferred<boolean>();
    vi.mocked(PubchiController.ensureDeviceReady).mockReturnValue(ready.promise);
    PubchiController.openFlyout({ question: QUESTION, source: 'post-menu', target: TARGET });
    render(
      <StrictMode>
        <PanelHarness />
      </StrictMode>,
    );

    await waitFor(() => expect(PubchiController.ensureDeviceReady).toHaveBeenCalled());
    expect(screen.getByLabelText('Question')).toHaveValue(QUESTION);
    expect(usePubchiStore.getState().flyout.prefill?.question).toBe(QUESTION);
    expect(PubchiController.fetchPubchiQuery).not.toHaveBeenCalled();
    await act(async () => ready.resolve(true));
    await waitFor(() => expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledTimes(1));
    expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'ask', question: QUESTION, target: TARGET }),
    );
    expect(usePubchiStore.getState().flyout.prefill).toBeUndefined();
    expect(screen.queryByTestId('pubchi-error')).not.toBeInTheDocument();
  });

  it.each(['edit', 'conversation', 'close', 'navigation', 'account'] as const)(
    'cancels a waiting summary on %s changes',
    async (change) => {
      const ready = deferred<boolean>();
      vi.mocked(PubchiController.ensureDeviceReady).mockReturnValue(ready.promise);
      PubchiController.openFlyout({ question: QUESTION, source: 'post-menu', target: TARGET });
      render(<PanelHarness />);
      await waitFor(() => expect(PubchiController.ensureDeviceReady).toHaveBeenCalled());
      await act(async () => {
        if (change === 'edit')
          fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'My own question' } });
        if (change === 'conversation') usePubchiStore.getState().clearConversation();
        if (change === 'close') PubchiController.closeFlyout();
        if (change === 'navigation') fireEvent.click(screen.getByRole('link', { name: 'Edit brain' }));
        if (change === 'account') useAuthStore.setState({ currentUserPubky: 'b'.repeat(52) });
      });
      await act(async () => ready.resolve(true));
      expect(PubchiController.fetchPubchiQuery).not.toHaveBeenCalled();
      expect(usePubchiStore.getState().flyout.prefill).toBeUndefined();
      if (change === 'edit') {
        fireEvent.click(screen.getByTestId('pubchi-ask'));
        await waitFor(() => expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledTimes(1));
        expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledWith(
          expect.objectContaining({ question: 'My own question' }),
        );
        expect(vi.mocked(PubchiController.fetchPubchiQuery).mock.calls[0][0].target).toBeUndefined();
      }
    },
  );

  it('submits only the latest contextual action when its target changes during setup', async () => {
    const ready = deferred<boolean>();
    vi.mocked(PubchiController.ensureDeviceReady).mockReturnValue(ready.promise);
    PubchiController.openFlyout({ question: QUESTION, source: 'post-menu', target: TARGET });
    render(<PanelHarness />);
    await waitFor(() => expect(PubchiController.ensureDeviceReady).toHaveBeenCalled());
    const nextTarget = { ...TARGET, uri: `pubky://${OWNER}/pub/pubky.app/posts/POST987654321` };
    const nextQuestion = 'Summarize this thread';
    act(() => PubchiController.openFlyout({ question: nextQuestion, source: 'post-menu', target: nextTarget }));
    await act(async () => ready.resolve(true));
    await waitFor(() => expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledTimes(1));
    expect(PubchiController.fetchPubchiQuery).toHaveBeenCalledWith(
      expect.objectContaining({ question: nextQuestion, target: nextTarget }),
    );
  });
});
