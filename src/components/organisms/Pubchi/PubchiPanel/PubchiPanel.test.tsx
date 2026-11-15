import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from './PubchiPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('react-hook-form', () => ({
  useWatch: () => watchedQuestion.value,
}));

vi.mock('@/organisms/RingApprovalDialog/RingApprovalDialog', () => ({
  RingApprovalDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="ring-approval-dialog" /> : null),
}));

const submit = vi.fn();
const cancel = vi.fn();
const retrySync = vi.fn();
const reapprove = vi.fn();
const setupDevice = vi.fn();
const watchedQuestion = vi.hoisted(() => ({ value: '' }));
const {
  getFeed,
  openFeedBuilder,
  closeFeedBuilder,
  closeFlyout,
  discoverTagSuggestions,
  reconcileDiscoveredTagSuggestion,
  revertDiscoveredTagSuggestion,
} = vi.hoisted(() => ({
  getFeed: vi.fn(),
  openFeedBuilder: vi.fn(),
  closeFeedBuilder: vi.fn(),
  closeFlyout: vi.fn(),
  discoverTagSuggestions: vi.fn().mockResolvedValue([]),
  reconcileDiscoveredTagSuggestion: vi.fn(),
  revertDiscoveredTagSuggestion: vi.fn(),
}));
const builderProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
const hookState = {
  form: {
    control: {},
    getValues: () => ({ question: '' }),
    trigger: async () => true,
    setValue: vi.fn(),
    reset: vi.fn(),
  },
  submit,
  cancel,
  result: undefined as PubchiQuerySuccess | undefined,
  errorCode: undefined as string | undefined,
  loading: false,
  elapsedMs: 0,
  enabled: true,
  pubchiAvailable: true as boolean | undefined,
  signingAvailable: true,
  signingUnavailableMessage: "This browser isn't set up for Pubchi yet. Set it up to start asking.",
  setupDevice,
  setupLoading: false,
};
const enrollmentState = {
  syncStatus: 'idle' as 'idle' | 'syncing' | 'rate-limited' | 'error',
  retrySync,
  needsReapproval: false,
  reapprove,
  loading: false,
  pubchi: undefined as { bot: string; displayName: string; verified: boolean } | undefined,
  config: undefined as { tier: 'read-only' | 'assisted' | 'autonomous'; brain: { execution: string } } | undefined,
};

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => hookState,
}));

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => enrollmentState,
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/controllers/pubchi/pubchi')>();
  return {
    ...original,
    PubchiController: {
      ...original.PubchiController,
      openFlyout: original.PubchiController.openFlyout,
      consumePrefill: original.PubchiController.consumePrefill,
      closeFlyout: () => closeFlyout(),
      discoverTagSuggestions: (...args: Parameters<typeof original.PubchiController.discoverTagSuggestions>) =>
        discoverTagSuggestions(...args),
      reconcileDiscoveredTagSuggestion: (
        ...args: Parameters<typeof original.PubchiController.reconcileDiscoveredTagSuggestion>
      ) => reconcileDiscoveredTagSuggestion(...args),
      revertDiscoveredTagSuggestion: (
        ...args: Parameters<typeof original.PubchiController.revertDiscoveredTagSuggestion>
      ) => revertDiscoveredTagSuggestion(...args),
      openFeedBuilder: (...args: Parameters<typeof openFeedBuilder>) => openFeedBuilder(...args),
      closeFeedBuilder: () => closeFeedBuilder(),
    },
  };
});

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    get: getFeed,
  },
}));

vi.mock('../PubchiFeedBuilder/PubchiFeedBuilder', () => ({
  PubchiFeedBuilder: (props: Record<string, unknown>) => {
    builderProps.current = props;
    return (
      <div data-testid="pubchi-feed-builder">
        <button
          type="button"
          onClick={() => void (props.onInterpret as (question: string) => Promise<void>)('make it wider')}
        >
          Interpret
        </button>
        <button type="button" onClick={() => (props.onOpenChange as (open: boolean) => void)(false)}>
          Close feed builder
        </button>
      </div>
    );
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string }) => unknown) =>
      selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
    {
      getState: () => ({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
    },
  ),
}));

vi.mock('@/molecules/ControlledTextareaField/ControlledTextareaField', () => ({
  ControlledTextareaField: () => (
    <textarea
      data-testid="pubchi-question"
      value={watchedQuestion.value}
      onChange={(event) => {
        watchedQuestion.value = event.target.value;
      }}
    />
  ),
}));

describe('PubchiPanel', () => {
  beforeEach(() => {
    enrollmentState.syncStatus = 'idle';
    retrySync.mockReset();
    cancel.mockReset();
    enrollmentState.needsReapproval = false;
    enrollmentState.pubchi = undefined;
    enrollmentState.config = undefined;
    submit.mockReset();
    reapprove.mockReset();
    setupDevice.mockReset();
    hookState.pubchiAvailable = true;
    hookState.setupLoading = false;
    hookState.loading = false;
    hookState.elapsedMs = 0;
    hookState.result = undefined;
    hookState.errorCode = undefined;
    hookState.form.setValue.mockReset();
    hookState.form.reset.mockReset();
    hookState.form.setValue.mockImplementation((name, value) => {
      if (name === 'question') watchedQuestion.value = value;
    });
    watchedQuestion.value = '';
    getFeed.mockReset();
    openFeedBuilder.mockReset();
    closeFeedBuilder.mockReset();
    closeFlyout.mockReset();
    discoverTagSuggestions.mockReset().mockResolvedValue([]);
    reconcileDiscoveredTagSuggestion.mockReset();
    revertDiscoveredTagSuggestion.mockReset();
    openFeedBuilder.mockImplementation((proposal) => usePubchiStore.getState().openFeedBuilder(proposal));
    closeFeedBuilder.mockImplementation(() => usePubchiStore.getState().closeFeedBuilder());
    closeFlyout.mockImplementation(() => usePubchiStore.getState().closeFlyout());
    builderProps.current = undefined;
    usePubchiStore.getState().clear();
  });

  it('collapses earlier exchanges with keyboard-accessible controls while keeping the latest visible', async () => {
    usePubchiStore.setState({
      conversation: {
        turns: [
          { role: 'user', text: 'First question' },
          { role: 'assistant', text: 'First answer', basis: 'web' },
          { role: 'user', text: 'Latest question' },
          { role: 'assistant', text: 'Latest answer', basis: 'graph' },
        ],
      },
    });
    const user = userEvent.setup();
    render(<PubchiPanel open onOpenChange={() => {}} />);

    const earlier = screen.getByRole('button', { name: 'First question' });
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('First answer')).not.toBeInTheDocument();
    expect(screen.getByText('Latest question')).toBeVisible();
    expect(screen.getByText('Latest answer')).toBeVisible();
    earlier.focus();
    await user.keyboard('{Enter}');
    expect(earlier).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('First answer')).toBeVisible();
    expect(screen.getByText('From the web')).toBeVisible();
    await user.keyboard(' ');
    expect(earlier).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps an orphaned answer separate from the next question in a bounded conversation', () => {
    usePubchiStore.setState({
      conversation: {
        turns: [
          { role: 'assistant', text: 'Earlier retained answer' },
          { role: 'user', text: 'Latest unanswered question' },
        ],
      },
    });
    render(<PubchiPanel open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Earlier answer' }));
    expect(screen.getByText('Earlier retained answer')).toBeVisible();
    expect(screen.getByText('Latest unanswered question')).toBeVisible();
  });

  it('collapses the previous latest exchange when a new question arrives', () => {
    usePubchiStore.setState({
      conversation: {
        turns: [
          { role: 'user', text: 'Previous latest question' },
          { role: 'assistant', text: 'Previous latest answer' },
        ],
      },
    });
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByText('Previous latest answer')).toBeVisible();

    act(() =>
      usePubchiStore.setState((state) => ({
        conversation: {
          turns: [...state.conversation.turns, { role: 'user', text: 'New question' }],
        },
      })),
    );

    expect(screen.getByRole('button', { name: 'Previous latest question' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Previous latest answer')).not.toBeInTheDocument();
    expect(screen.getByText('New question')).toBeVisible();
  });

  it.each([
    ['graph', 'What the graph shows'],
    ['web', 'From the web'],
    ['knowledge', 'From Pubky docs'],
    ['mixed', 'From more than one source'],
    ['model', 'From what I know'],
  ])('uses the %s heading for a saved answer', (basis, heading) => {
    usePubchiStore.setState({ conversation: { turns: [{ role: 'assistant', text: 'Saved answer', basis }] } });
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(within(screen.getByTestId('pubchi-conversation')).getByText(heading)).toBeVisible();
  });

  it('keeps the exact pasted post target outside the readable summary question', () => {
    const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const uri = `pubky://${owner}/pub/pubky.app/posts/POST123456789`;
    watchedQuestion.value = uri;
    render(<PubchiPanel open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByTestId('pubchi-summarize-thread'));

    expect(hookState.form.setValue).toHaveBeenCalledWith('question', 'Summarize this thread', { shouldValidate: true });
    expect(submit).toHaveBeenCalledWith('ask', { target: { kind: 'post', uri } });
    expect(screen.getByRole('link', { name: 'Selected thread' })).toHaveAttribute(
      'href',
      `/post/${owner}/POST123456789`,
    );
    expect(screen.getByTestId('pubchi-context')).not.toHaveTextContent(uri);
    submit.mockClear();
    fireEvent.click(screen.getByTestId('pubchi-ask'));
    expect(submit).toHaveBeenCalledWith('ask', { target: { kind: 'post', uri } });
  });

  it('cancels a pending answer without describing an unreported backend stage', () => {
    hookState.loading = true;
    hookState.elapsedMs = 2_450;
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Working on your answer…');
    expect(screen.queryByText(/Reading the graph/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    expect(cancel).toHaveBeenCalledOnce();

    hookState.elapsedMs = 15_000;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Still working on your answer…');
  });

  it('offers a retry for failed sync while keeping the conversation available', () => {
    enrollmentState.syncStatus = 'error';
    usePubchiStore.setState({ conversation: { turns: [{ role: 'user', text: 'Existing question' }] } });
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Pubchi could not sync. Your current data is still available.',
    );
    expect(screen.getByText('Existing question')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));
    expect(retrySync).toHaveBeenCalledOnce();
  });

  it('explains rate-limited sync without offering a cap-bypassing retry', () => {
    enrollmentState.syncStatus = 'rate-limited';
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent('Pubchi sync is paused briefly. It will retry automatically.');
    expect(screen.queryByRole('button', { name: 'Retry sync' })).not.toBeInTheDocument();
  });

  it('submits immediately when opened from the post menu', () => {
    const target = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-1' };
    const prefill = {
      question: `Summarize this thread ${target.uri}`,
      source: 'post-menu' as const,
      target,
    };
    PubchiController.openFlyout(prefill);

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(hookState.form.setValue).toHaveBeenCalledWith('question', prefill.question, { shouldValidate: true });
    expect(submit).toHaveBeenCalledWith('ask', { target });
  });

  it('consumes chip and empty flyout opens without submitting a query', () => {
    PubchiController.openFlyout({
      question: 'Suggest tags for this user',
      source: 'chip',
      target: { kind: 'user', uri: 'pubky://owner/pub/pubky.app/profile.json' },
    });
    const chipView = render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(submit).not.toHaveBeenCalled();

    submit.mockClear();
    chipView.unmount();
    usePubchiStore.getState().clear();
    PubchiController.openFlyout();
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(submit).not.toHaveBeenCalled();
  });

  it('starts a fresh conversation for a second post-menu summarize', () => {
    const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const firstTarget = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-1' };
    const secondTarget = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-2' };
    usePubchiStore.getState().setConfig(null, owner);
    usePubchiStore
      .getState()
      .addConversationTurn({ role: 'user', text: `Summarize this thread ${firstTarget.uri}` }, owner);
    usePubchiStore.getState().addConversationTurn({ role: 'assistant', text: 'First summary' }, owner);

    const question = `Summarize this thread ${secondTarget.uri}`;
    PubchiController.openFlyout({ question, source: 'post-menu', target: secondTarget });
    expect(usePubchiStore.getState().conversation.turns).toEqual([]);

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(usePubchiStore.getState().conversation.turns).toEqual([]);
    expect(submit).toHaveBeenCalledWith('ask', { target: secondTarget });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('consumes a prefill that arrives while the flyout is already open', () => {
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);
    const target = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/post-1' };
    const prefill = {
      question: `Summarize this thread ${target.uri}`,
      source: 'post-menu' as const,
      target,
    };
    PubchiController.openFlyout(prefill);
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(hookState.form.setValue).toHaveBeenCalledWith('question', prefill.question, { shouldValidate: true });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith('ask', { target });
  });

  it('keeps the consumed post target through canonical button edits', () => {
    const target = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/POST123456789' };
    const question = `Summarize this thread ${target.uri}`;
    watchedQuestion.value = question;
    const prefill = { question, source: 'post-menu' as const, target };
    PubchiController.openFlyout(prefill);
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-suggest-tags')).toBeEnabled();
    expect(screen.getByTestId('pubchi-summarize-thread')).toBeEnabled();
    fireEvent.click(screen.getByTestId('pubchi-suggest-tags'));
    expect(screen.getByTestId('pubchi-suggest-tags')).toBeInTheDocument();
    expect(submit).toHaveBeenCalledWith('ask', { target });
    expect(hookState.form.setValue).toHaveBeenCalledWith('question', 'Suggest tags for this post', {
      shouldValidate: true,
    });
  });

  it('renders target receipts with Revert and Already applied actions', async () => {
    const target = {
      kind: 'post' as const,
      uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/posts/0035Q0HAH8V6G',
    };
    const applied = 'a'.repeat(64);
    const superseded = 'b'.repeat(64);
    discoverTagSuggestions.mockResolvedValue([
      {
        applicationId: applied,
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        target,
        label: 'builder',
        status: 'applied',
        alreadyExisted: false,
      },
      {
        applicationId: superseded,
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        target,
        label: 'rust',
        status: 'superseded',
        alreadyExisted: true,
      },
    ]);
    const question = `Suggest tags for this post ${target.uri}`;
    watchedQuestion.value = question;
    PubchiController.openFlyout({ question, source: 'post-menu', target });

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(await screen.findAllByTestId(/^pubchi-applied-row-/)).toHaveLength(2);
    expect(screen.getByTestId(`pubchi-tag-revert-${applied}`)).toBeInTheDocument();
    expect(screen.getByTestId(`pubchi-tag-already-applied-${superseded}`)).toBeInTheDocument();
  });

  it('does not suggest tags for a user target', () => {
    const target = { kind: 'user' as const, uri: 'pubky://owner/pub/pubky.app/profile.json' };
    const prefill = { question: 'Suggest tags for this user', source: 'chip' as const, target };
    watchedQuestion.value = prefill.question;
    PubchiController.openFlyout(prefill);
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-suggest-tags')).toBeDisabled();
    fireEvent.click(screen.getByTestId('pubchi-suggest-tags'));
    expect(submit).not.toHaveBeenCalled();
  });

  it('drops a consumed target when the question changes or the flyout closes', async () => {
    const target = { kind: 'post' as const, uri: 'pubky://owner/pub/pubky.app/posts/POST123456789' };
    const question = `Summarize this thread ${target.uri}`;
    let currentQuestion = question;
    watchedQuestion.value = currentQuestion;
    PubchiController.openFlyout({ question, source: 'post-menu', target });
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-suggest-tags')).toBeInTheDocument();

    currentQuestion = 'A different question';
    watchedQuestion.value = currentQuestion;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.queryByTestId('pubchi-suggest-tags')).not.toBeInTheDocument());

    currentQuestion = question;
    watchedQuestion.value = currentQuestion;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.queryByTestId('pubchi-suggest-tags')).not.toBeInTheDocument();

    PubchiController.openFlyout({ question, source: 'post-menu', target });
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-suggest-tags')).toBeInTheDocument();

    view.rerender(<PubchiPanel open={false} onOpenChange={() => {}} />);
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.queryByTestId('pubchi-suggest-tags')).not.toBeInTheDocument());
  });

  it('drops a consumed target when starting a new conversation', () => {
    const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const target = { kind: 'user' as const, uri: 'pubky://owner/pub/pubky.app/profile.json' };
    const question = 'Suggest tags for this user';
    watchedQuestion.value = question;
    usePubchiStore.getState().setConfig(null, owner);
    usePubchiStore.getState().addConversationTurn({ role: 'user', text: 'Previous question' }, owner);
    PubchiController.openFlyout({ question, source: 'chip', target });
    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-suggest-tags')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    expect(screen.queryByTestId('pubchi-suggest-tags')).not.toBeInTheDocument();
    expect(hookState.form.reset).toHaveBeenCalledWith({ question: '' });
  });

  it('shows an older feed response without replacing or closing an editable draft', () => {
    const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    watchedQuestion.value = 'Builders to follow';
    const view = render(<PubchiPanel open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('pubchi-build-feed'));
    const draft = usePubchiStore.getState().feedBuilder.proposal;
    const calls = openFeedBuilder.mock.calls.length;
    hookState.result = {
      kind: 'feed',
      applyAllowed: true,
      result: {
        schema: 'pubchi-feed-proposal',
        version: 1,
        owner,
        bot: owner,
        generated_at: 1,
        feed: { name: 'Legacy proposal', created_at: 1, feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
        warnings: [],
        installed_user_feed_id: null,
      },
    };
    view.rerender(<PubchiPanel open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('pubchi-feed-version-error')).toHaveTextContent('older feed format');
    expect(builderProps.current?.interpretationError).toContain('Your draft is unchanged');
    expect(builderProps.current?.proposal).toBe(draft);
    expect(usePubchiStore.getState().feedBuilder.open).toBe(true);
    expect(openFeedBuilder).toHaveBeenCalledTimes(calls);
    expect(screen.getByTestId('pubchi-question')).toHaveValue('Builders to follow');
    hookState.loading = true;
    view.rerender(<PubchiPanel open onOpenChange={vi.fn()} />);
    expect(screen.getByTestId('pubchi-feed-builder')).toBeInTheDocument();
    expect(builderProps.current?.interpreting).toBe(true);
  });

  it('sends no model-controlled target when interpreting a create proposal', async () => {
    hookState.result = {
      kind: 'feed-v2',
      applyAllowed: false,
      result: {
        schema: 'pubchi-feed-proposal',
        version: 2,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        mode: 'create',
        target_feed_id: 'model-controlled-target',
        feed: { name: 'Builders', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
        mapping: { status: 'exact', unmapped: [] },
        warnings: [],
        installed_user_feed_id: null,
      },
    } as PubchiQuerySuccess;

    render(<PubchiPanel open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByText('Interpret'));
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());

    expect(submit).toHaveBeenCalledWith('build-feed', {
      proposalVersion: 2,
    });
  });

  it('opens each feed result once and opens a new result after refocus', async () => {
    const proposal = {
      schema: 'pubchi-feed-proposal',
      version: 2,
      bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      generated_at: 1,
      mode: 'create',
      target_feed_id: null,
      feed: { name: 'Builders', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
      mapping: { status: 'exact', unmapped: [] },
      warnings: [],
      installed_user_feed_id: null,
    };
    hookState.result = { kind: 'feed-v2', applyAllowed: false, result: proposal } as PubchiQuerySuccess;
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    await vi.waitFor(() => expect(openFeedBuilder).toHaveBeenCalledOnce());
    usePubchiStore.getState().closeFeedBuilder();
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    expect(openFeedBuilder).toHaveBeenCalledOnce();

    hookState.result = { kind: 'feed-v2', applyAllowed: false, result: { ...proposal } } as PubchiQuerySuccess;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    await vi.waitFor(() => expect(openFeedBuilder).toHaveBeenCalledTimes(2));
  });

  it('restores the current interpretation question when the request fails', async () => {
    const proposal = {
      schema: 'pubchi-feed-proposal',
      version: 2,
      bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      generated_at: 1,
      mode: 'create',
      target_feed_id: null,
      feed: { name: 'Builders', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
      mapping: { status: 'exact', unmapped: [] },
      warnings: [],
      installed_user_feed_id: null,
    };
    watchedQuestion.value = 'current draft';
    hookState.result = { kind: 'feed-v2', applyAllowed: false, result: proposal } as PubchiQuerySuccess;
    submit.mockResolvedValue(false);
    render(<PubchiPanel open onOpenChange={() => {}} />);

    await vi.waitFor(() => expect(builderProps.current).toBeDefined());
    fireEvent.click(screen.getByText('Interpret'));
    await vi.waitFor(() =>
      expect(hookState.form.setValue).toHaveBeenLastCalledWith('question', 'current draft', { shouldValidate: true }),
    );
  });

  it('clears the edited feed before submitting a new create question', async () => {
    const feed = { id: 'feed-a', name: 'Feed A' };
    getFeed.mockResolvedValue(feed);
    PubchiController.openFlyout({
      question: 'Update feed A',
      feedId: 'feed-a',
      source: 'chip',
    });
    hookState.result = {
      kind: 'feed-v2',
      applyAllowed: false,
      result: {
        schema: 'pubchi-feed-proposal',
        version: 2,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        mode: 'update',
        target_feed_id: 'feed-a',
        feed: { name: 'Feed A', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
        mapping: { status: 'exact', unmapped: [] },
        warnings: [],
        installed_user_feed_id: 'feed-a',
      },
    } as PubchiQuerySuccess;

    render(<PubchiPanel open onOpenChange={() => {}} />);
    await vi.waitFor(() => expect(builderProps.current?.existingFeed).toBe(feed));

    fireEvent.click(screen.getByTestId('pubchi-ask'));
    await vi.waitFor(() => expect(builderProps.current?.existingFeed).toBeUndefined());
    expect(submit).toHaveBeenCalledWith('ask', undefined);
  });

  it('clears an edited feed before opening a create proposal', async () => {
    const feed = { id: 'feed-a', name: 'Feed A' };
    getFeed.mockResolvedValue(feed);
    PubchiController.openFlyout({
      question: 'Update feed A',
      feedId: 'feed-a',
      source: 'chip',
    });
    const updateProposal = {
      schema: 'pubchi-feed-proposal',
      version: 2,
      bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      generated_at: 1,
      mode: 'update',
      target_feed_id: 'feed-a',
      feed: { name: 'Feed A', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
      mapping: { status: 'exact', unmapped: [] },
      warnings: [],
      installed_user_feed_id: 'feed-a',
    };
    hookState.result = { kind: 'feed-v2', applyAllowed: false, result: updateProposal } as PubchiQuerySuccess;
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);
    await vi.waitFor(() => expect(builderProps.current?.existingFeed).toBe(feed));
    fireEvent.click(screen.getByText('Close feed builder'));

    hookState.result = {
      kind: 'feed-v2',
      applyAllowed: false,
      result: { ...updateProposal, mode: 'create', target_feed_id: null, installed_user_feed_id: null },
    } as PubchiQuerySuccess;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    await vi.waitFor(() => expect(builderProps.current?.existingFeed).toBeUndefined());
  });

  it('mounts the production panel surface', () => {
    hookState.signingAvailable = true;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_PANEL_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-build-feed')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quick questions' })).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-who-tagged-me')).not.toBeInTheDocument();
  });

  it('flags an over-length question live and clears the state when shortened', () => {
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);
    const question = screen.getByTestId('pubchi-question');

    fireEvent.change(question, { target: { value: '😀'.repeat(251) } });
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-question-count')).toHaveClass('text-destructive');
    expect(screen.getByTestId('pubchi-question-over-limit')).toHaveTextContent(
      'Questions are limited to 500 characters.',
    );
    expect(screen.getByTestId('pubchi-ask')).toBeDisabled();

    fireEvent.change(question, { target: { value: '😀'.repeat(250) } });
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-question-count')).not.toHaveClass('text-destructive');
    expect(screen.queryByTestId('pubchi-question-over-limit')).not.toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
  });

  it('closes the flyout while keeping the create feed dialog open', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return <PubchiPanel open={open} onOpenChange={setOpen} />;
    }

    render(<Harness />);

    fireEvent.click(screen.getByTestId('pubchi-build-feed'));

    expect(usePubchiStore.getState().flyout.open).toBe(false);
    expect(screen.queryByTestId(PUBCHI_PANEL_SURFACE)).not.toBeInTheDocument();
    expect(screen.getByTestId('pubchi-feed-builder')).toBeInTheDocument();
  });

  it('unmounts the panel when the closed feed builder closes', () => {
    usePubchiStore.getState().openFlyout();

    function Harness() {
      const flyoutOpen = usePubchiStore((state) => state.flyout.open);
      const builderOpen = usePubchiStore((state) => state.feedBuilder.open);
      const [open, setOpen] = useState(flyoutOpen);
      return flyoutOpen || builderOpen ? <PubchiPanel open={open} onOpenChange={setOpen} /> : null;
    }

    render(<Harness />);
    fireEvent.click(screen.getByTestId('pubchi-build-feed'));
    expect(screen.getByTestId('pubchi-feed-builder')).toBeInTheDocument();
    expect(screen.queryByTestId(PUBCHI_PANEL_SURFACE)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close feed builder' }));

    expect(screen.queryByTestId(PUBCHI_PANEL_SURFACE)).not.toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-feed-builder')).not.toBeInTheDocument();
  });

  it('keeps the last known tier while enrollment config reloads', () => {
    enrollmentState.pubchi = {
      bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      displayName: 'Scout II',
      verified: true,
    };
    enrollmentState.config = { tier: 'assisted', brain: { execution: 'synonym-hosted' } };
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-flyout-header')).toHaveTextContent('Assisted');

    enrollmentState.config = undefined;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-flyout-header')).toHaveTextContent('Assisted');
  });

  it('remembers the quick questions toggle in the Pubchi store', () => {
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quick questions' }));
    expect(screen.getByTestId('pubchi-who-tagged-me')).toBeInTheDocument();

    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-who-tagged-me')).toBeInTheDocument();
  });

  it('disables Ask and Build feed when signing is unavailable', () => {
    hookState.signingAvailable = false;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-signing-unavailable')).toHaveTextContent(
      "This browser isn't set up for Pubchi yet. Set it up to start asking.",
    );
    expect(screen.getByTestId('pubchi-ask')).toBeDisabled();
    expect(screen.getByTestId('pubchi-build-feed')).toBeDisabled();
    fireEvent.click(screen.getByTestId('pubchi-setup-device'));
    expect(setupDevice).toHaveBeenCalledOnce();
    hookState.signingAvailable = true;
  });

  it('shows the create prompt when the owner has no Pubchi', () => {
    hookState.pubchiAvailable = false;
    hookState.signingAvailable = false;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('Create a Pubchi in Settings');
    expect(screen.queryByTestId('pubchi-setup-device')).not.toBeInTheDocument();
    hookState.signingAvailable = true;
  });

  it('shows degraded session recovery without disabling read-only asks', () => {
    enrollmentState.needsReapproval = true;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-degraded-session')).toHaveTextContent(
      "Your sign-in predates Pubchi and can't reach its folders yet. Tap Re-approve and confirm in Pubky Ring.",
    );
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(screen.getByTestId('ring-approval-dialog')).toBeInTheDocument();
  });

  it('explains feed errors instead of rendering the raw code', () => {
    hookState.errorCode = 'FEED_SPECS_INVALID';

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByRole('alert')).toHaveTextContent("I couldn't turn that into a feed");
    expect(screen.getByRole('alert')).not.toHaveTextContent('FEED_SPECS_INVALID');
  });

  it('shows a skeleton and elapsed seconds while an answer is loading, then replaces it', () => {
    hookState.loading = true;
    hookState.elapsedMs = 2450;
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-answer-loading')).toBeInTheDocument();
    expect(screen.getByText('Working on your answer…')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-answer')).not.toBeInTheDocument();

    hookState.loading = false;
    hookState.result = {
      kind: 'answer',
      result: {
        schema: 'pubchi-answer',
        version: 1,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        run_id: 'answer',
        purpose: 'ask',
        question: 'Who is active?',
        summary: 'Alice is active.',
        evidence: [],
        sources: [],
        tool_trace_summary: { tools: [], call_count: 0, truncated: false },
        policy_version: 1,
      },
    } as PubchiQuerySuccess;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-answer')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-answer-loading')).not.toBeInTheDocument();
  });

  it('labels who-tagged-me evidence as Tagged by N accounts', () => {
    hookState.result = {
      kind: 'query',
      result: {
        schema: 'pubchi-query-result',
        version: 1,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        run_id: 'query',
        purpose: 'who-tagged-me',
        scope_owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        items: [
          {
            label: 'builder',
            source_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/tags/builder',
            subject_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/profile.json',
            claimant_count: 1,
          },
          {
            label: 'rust',
            source_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/tags/rust',
            subject_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/profile.json',
            claimant_count: 3,
          },
        ],
        tool_trace_summary: { tools: ['get_tag_landscape'], call_count: 1, truncated: false },
        policy_version: 1,
      },
    } as PubchiQuerySuccess;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-evidence')).toBeInTheDocument();
    expect(screen.getByText('Tagged by 1 account')).toBeInTheDocument();
    expect(screen.getByText('Tagged by 3 accounts')).toBeInTheDocument();
    expect(screen.getAllByText('Tagger')).toHaveLength(2);
    expect(screen.queryByText(/Claimants/)).not.toBeInTheDocument();
  });
});
