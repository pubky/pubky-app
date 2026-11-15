import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import { PubchiAnswerCard } from './PubchiAnswerCard';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const answer: PubchiAnswerV1 = {
  schema: 'pubchi-answer',
  version: 1,
  bot: owner,
  owner,
  generated_at: 1,
  run_id: 'test-answer',
  purpose: 'ask',
  question: 'Who is active?',
  summary: 'Alice is active.',
  evidence: [
    {
      kind: 'user',
      label: 'Alice',
      uri: `pubky://${owner}/pub/pubky.app/profile.json`,
      claimants: [owner],
      claimant_count: 1,
      in_your_graph: true,
    },
  ],
  sources: [],
  tool_trace_summary: { tools: [], call_count: 0, truncated: false },
  policy_version: 1,
};

vi.mock('@/controllers/user/user', () => ({
  UserController: { getOrFetch: vi.fn().mockResolvedValue({ name: 'Alice' }) },
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    applyTagSuggestion: vi.fn(),
    getTagSuggestionStatuses: vi.fn(async () => ({})),
    reconcileTagSuggestion: vi.fn(),
    applyDraftPost: vi.fn(),
    rejectDraftPost: vi.fn(),
    revertDraftPost: vi.fn(),
    reconcileDraftPost: vi.fn(),
    getDraftPostStatus: vi.fn(async () => 'proposed'),
  },
}));

describe('PubchiAnswerCard', () => {
  it('renders evidence before the interpretation label', async () => {
    render(<PubchiAnswerCard answer={answer} currentUserPubky={owner} />);
    expect(screen.getByTestId('pubchi-answer')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText("Pubchi's reading of the evidence")).toBeInTheDocument();
    expect(screen.getByText('In your graph')).toBeInTheDocument();
    expect(screen.getByText('Evidence: 1')).toBeInTheDocument();
  });

  it('groups service C3 sections before unsectioned evidence', () => {
    const c3Answer: PubchiAnswerV1 = {
      ...answer,
      tool_trace_summary: { tools: ['what_did_i_miss'], call_count: 1, truncated: true },
      continuation: {
        since: '2026-09-10T06:00:00Z',
        until: '2026-09-10T07:00:00Z',
        complete: false,
        skipped: 2,
      },
      evidence: [
        { ...answer.evidence[0], kind: 'post', label: 'Followed post', section: 'followed_posts' },
        { ...answer.evidence[0], kind: 'post', label: 'Reply', section: 'replies_to_you' },
        { ...answer.evidence[0], kind: 'tag', label: 'bitcoin', section: 'tags_on_you' },
        { ...answer.evidence[0], kind: 'claim', label: 'Unsectioned claim' },
      ],
    };

    render(<PubchiAnswerCard answer={c3Answer} currentUserPubky={owner} />);

    expect(screen.getByTestId('pubchi-evidence-section-followed_posts')).toHaveTextContent(
      'Posts from people you follow (1)',
    );
    expect(screen.getByTestId('pubchi-evidence-section-replies_to_you')).toHaveTextContent('Replies to you (1)');
    expect(screen.getByTestId('pubchi-evidence-section-tags_on_you')).toHaveTextContent('Tags on you (1)');
    expect(screen.getByTestId('pubchi-evidence-section-claim')).toHaveTextContent('Evidence (1)');
    expect(screen.getAllByText('and 2 more')).toHaveLength(3);
  });

  it.each([
    [['nexus_influencer'], 'Followers'],
    [['rank_users'], 'Followers'],
    [['rank_tags_recv'], 'Tags received'],
    [['rank_tags_apply'], 'Tags applied'],
    [['nexus_user_tags'], 'Tagged by'],
    [['get_tag_landscape'], 'Tagged by'],
    [['tag_landscape'], 'Tagged by'],
    [['top_posts'], 'Replies'],
    [['recommend_follows'], 'Count'],
    [['recommend'], 'Count'],
    [['stale_follows'], 'Count'],
    [['unknown_route'], 'Evidence'],
  ])('labels %s counts as %s', (tools, label) => {
    render(
      <PubchiAnswerCard
        answer={{ ...answer, tool_trace_summary: { ...answer.tool_trace_summary, tools } } as PubchiAnswerV1}
      />,
    );
    expect(screen.getByText(`${label}: 1`)).toBeInTheDocument();
  });

  it('shows taggers but not claimant details for user evidence', async () => {
    const tagger = 'a1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
    const tagAnswer = {
      ...answer,
      evidence: [
        { ...answer.evidence[0], kind: 'tag' as const, claimants: [tagger] },
        { ...answer.evidence[0], label: 'Bob', claimants: [owner] },
      ],
      tool_trace_summary: { tools: ['get_tag_landscape'], call_count: 1, truncated: false },
    };
    render(<PubchiAnswerCard answer={tagAnswer} currentUserPubky={owner} />);
    await waitFor(() => expect(screen.getByRole('link', { name: /Alice/ })).toBeInTheDocument());
    expect(screen.queryByText(owner)).not.toBeInTheDocument();
  });

  it('uses the graph heading for deterministic routes', () => {
    render(
      <PubchiAnswerCard
        answer={{ ...answer, tool_trace_summary: { tools: ['top_posts'], call_count: 1, truncated: false } }}
        currentUserPubky={owner}
      />,
    );
    expect(screen.getByText('What the graph shows')).toBeInTheDocument();
    expect(screen.queryByText("Pubchi's reading of the evidence")).not.toBeInTheDocument();
  });

  it('does not repeat an answer with no supporting details', () => {
    render(<PubchiAnswerCard answer={{ ...answer, evidence: [], summary: '' }} currentUserPubky={owner} />);
    expect(screen.queryByText('No evidence was found for this question.')).not.toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-tool-trace')).not.toBeInTheDocument();
  });

  it('omits a graph summary when it matches the conversation reply', () => {
    render(
      <>
        <div>Alice is active.</div>
        <PubchiAnswerCard
          answer={{ ...answer, tool_trace_summary: { tools: ['top_posts'], call_count: 1, truncated: false } }}
          replyText=" Alice is active. "
          currentUserPubky={owner}
        />
      </>,
    );
    expect(screen.getAllByText('Alice is active.')).toHaveLength(1);
    expect(screen.getByText('What the graph shows')).toBeInTheDocument();
  });

  it('keeps a graph summary when the conversation reply is rewritten', () => {
    render(
      <PubchiAnswerCard
        answer={{ ...answer, tool_trace_summary: { tools: ['top_posts'], call_count: 1, truncated: false } }}
        replyText="The graph found Alice."
        currentUserPubky={owner}
      />,
    );
    expect(screen.getByText('Alice is active.')).toBeInTheDocument();
    expect(screen.getByText('What the graph shows')).toBeInTheDocument();
  });

  it('shows the run id and singular tool-call label in the visible source row', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          run_id: 'run-123',
          tool_trace_summary: { tools: ['nexus_user_tags'], call_count: 1, truncated: false },
        }}
      />,
    );

    expect(screen.getByTestId('pubchi-tool-trace')).toHaveTextContent('Sources: nexus_user_tags · 1 call');
    fireEvent.click(screen.getByText('Sources: nexus_user_tags · 1 call'));
    expect(screen.getByTestId('pubchi-run-id')).toHaveTextContent('run-123');
    expect(screen.getByTestId('pubchi-run-id-copy')).toBeInTheDocument();
  });

  it('renders the service-provided scope line for an owner network', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          scope: {
            time: {
              since_ms: Date.parse('2026-09-03T00:00:00Z'),
              until_ms: Date.parse('2026-09-10T00:00:00Z'),
              label: 'last 7 days',
              source: 'default',
            },
            graph: { kind: 'owner_network', hops: 2 },
            filters: [],
            complete: true,
          },
        }}
      />,
    );
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent(
      'Scope: last 7 days (Sep 3–10 UTC) · your network (2 hops)',
    );
  });

  it('preserves a production scope label without duplicating the UTC range', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          scope: {
            time: {
              since_ms: Date.parse('2026-09-03T00:00:00Z'),
              until_ms: Date.parse('2026-09-10T00:00:00Z'),
              label: 'last 7 days (Sep 3–10 UTC)',
              source: 'default',
            },
            graph: { kind: 'whole_graph' },
            filters: [],
            complete: true,
          },
        }}
      />,
    );
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent(
      'Scope: last 7 days (Sep 3–10 UTC) · whole graph',
    );
    expect(screen.getByTestId('pubchi-answer-scope').textContent?.match(/UTC/g)).toHaveLength(1);
  });

  it('renders superseded suggestions as already applied without actions', () => {
    const c5Answer = {
      ...answer,
      section: 'tag_suggestions' as const,
      target: {
        kind: 'user' as const,
        uri: `pubky://${owner}/pub/pubky.app/profile.json`,
        snapshot_sha256: 'a'.repeat(64),
      },
      tag_suggestions: [
        {
          label: 'pubky-app',
          rationale: 'Matches the public profile.',
          evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
          already_applied: true,
          source: 'vocab' as const,
        },
      ],
    };
    render(<PubchiAnswerCard answer={c5Answer} currentUserPubky={owner} />);
    expect(screen.getByText('Already applied')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders a controller-superseded suggestion as already applied without actions', async () => {
    vi.mocked(PubchiController.applyTagSuggestion).mockResolvedValue('superseded');
    const c5Answer = {
      ...answer,
      section: 'tag_suggestions' as const,
      target: {
        kind: 'user' as const,
        uri: `pubky://${owner}/pub/pubky.app/profile.json`,
        snapshot_sha256: 'a'.repeat(64),
      },
      tag_suggestions: [
        {
          label: 'pubky-app',
          rationale: 'Matches the public profile.',
          evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
          already_applied: false,
          source: 'vocab' as const,
        },
      ],
    };
    render(
      <PubchiAnswerCard
        answer={c5Answer}
        binding={{
          owner,
          bot: owner,
          servedPurpose: 'ask',
          question: c5Answer.question,
          target: c5Answer.target,
          submitted_at: c5Answer.generated_at * 1_000,
          recordId: 'record-1',
        }}
        currentUserPubky={owner}
      />,
    );

    fireEvent.click(screen.getByTestId('pubchi-tag-approve-0'));

    await waitFor(() =>
      expect(screen.getByTestId('pubchi-tag-already-applied-0')).toHaveTextContent('Already applied'),
    );
    expect(screen.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders an unknown apply outcome with safe copy and only Check again', async () => {
    vi.mocked(PubchiController.getTagSuggestionStatuses).mockResolvedValue({ 0: 'reconciliation-pending' });
    vi.mocked(PubchiController.reconcileTagSuggestion).mockResolvedValue('reconciliation-pending');
    const c5Answer = {
      ...answer,
      section: 'tag_suggestions' as const,
      target: {
        kind: 'user' as const,
        uri: `pubky://${owner}/pub/pubky.app/profile.json`,
        snapshot_sha256: 'a'.repeat(64),
      },
      tag_suggestions: [
        {
          label: 'pubky-app',
          rationale: 'Matches the public profile.',
          evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
          already_applied: false,
          source: 'vocab' as const,
        },
      ],
    };
    render(
      <PubchiAnswerCard
        answer={c5Answer}
        binding={{
          owner,
          bot: owner,
          servedPurpose: 'ask',
          question: c5Answer.question,
          target: c5Answer.target,
          submitted_at: c5Answer.generated_at * 1_000,
          recordId: 'record-1',
        }}
        currentUserPubky={owner}
      />,
    );

    expect(
      await screen.findByText(
        "Pubchi could not confirm the result of this tag. Check again, or manage the tag from the post's tags.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revert' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders no graph lookup without inventing a time scope', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          scope: {
            time: null,
            graph: { kind: 'none' },
            filters: [],
            complete: true,
          },
        }}
      />,
    );
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent('No graph lookup');
  });

  it('renders nothing when older answers have no scope', () => {
    render(<PubchiAnswerCard answer={answer} />);
    expect(screen.queryByTestId('pubchi-answer-scope')).not.toBeInTheDocument();
  });

  it('renders knowledge provenance and outbound citations', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          basis: 'knowledge',
          summary: 'Pubky uses public homeservers.',
          scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
          citations: [
            {
              kind: 'knowledge',
              title: 'Pubky documentation',
              url: 'https://docs.pubky.org/guide',
              snippet: 'Public source',
              corpus_version: '2026-09',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('From Pubky docs')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-answer-scope')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pubky documentation' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Corpus version: 2026-09')).toBeInTheDocument();
  });

  it('renders mixed provenance as graph evidence plus knowledge citations', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          basis: 'mixed',
          citations: [{ kind: 'web', title: 'Current source', url: 'https://example.com/source' }],
          scope: { time: null, graph: { kind: 'whole_graph' }, filters: [], complete: true },
        }}
      />,
    );
    expect(screen.getByText('From more than one source')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-answer-scope')).toHaveTextContent('whole graph');
    expect(screen.getByRole('link', { name: 'Current source' })).toBeInTheDocument();
  });

  it('renders the feed catalog answer as knowledge text', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          basis: 'knowledge',
          summary:
            'Feeds support name, icon, tags, domain_tags, reach, sort, layout, and content. Reach supports following, friends, all, wot, and me in this App.',
          evidence: [],
          scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
          citations: [
            {
              kind: 'knowledge',
              title: 'Pubchi feed catalog v2',
              url: 'https://docs.pubky.org/pubchi/feed-catalog',
              corpus_version: '2',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText(/name, icon, tags, domain_tags, reach, sort, layout, and content/)).toBeInTheDocument();
    expect(screen.getByText('From Pubky docs')).toBeInTheDocument();
  });

  it.each([
    ['web', 'From the web'],
    ['knowledge', 'From Pubky docs'],
    ['graph', 'What the graph shows'],
    ['mixed', 'From more than one source'],
    ['model', 'From what I know'],
    ['corpus-v2', 'From what I know'],
  ] as const)('renders the %s heading', (basis, heading) => {
    render(
      <PubchiAnswerCard
        answer={{
          ...answer,
          basis,
          scope:
            basis === 'graph' || basis === 'mixed'
              ? { time: null, graph: { kind: 'whole_graph' }, filters: [], complete: true }
              : { time: null, graph: { kind: 'none' }, filters: [], complete: true },
        }}
      />,
    );
    expect(screen.getByText(heading)).toBeInTheDocument();
  });

  it('renders draft HTML and javascript: as text', () => {
    render(
      <PubchiAnswerCard
        answer={{
          ...draftAnswer(),
          draft_post: {
            ...draftAnswer().draft_post!,
            content: '<script>alert(1)</script> and javascript:alert(1)',
          },
        }}
        binding={draftBinding()}
        currentUserPubky={owner}
      />,
    );
    const content = screen.getByTestId('pubchi-draft-post-content');
    expect(content).toHaveTextContent('<script>alert(1)</script> and javascript:alert(1)');
    expect(content.querySelector('script')).toBeNull();
    expect(content.querySelector('a')).toBeNull();
  });

  it('renders a draft post for explicit approval and does not show tag actions', () => {
    render(<PubchiAnswerCard answer={draftAnswer()} binding={draftBinding()} currentUserPubky={owner} />);
    expect(screen.getByTestId('pubchi-draft-post')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-draft-post-content')).toHaveTextContent(
      'Pubky keeps public social state on your homeserver.',
    );
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.queryByText('Suggested tags')).not.toBeInTheDocument();
  });

  it('publishes only after Approve and then offers Revert', async () => {
    vi.mocked(PubchiController.applyDraftPost).mockResolvedValue('applied');
    render(<PubchiAnswerCard answer={draftAnswer()} binding={draftBinding()} currentUserPubky={owner} />);

    fireEvent.click(screen.getByTestId('pubchi-draft-post-approve'));

    expect(await screen.findByText('Published as you')).toBeInTheDocument();
    expect(PubchiController.applyDraftPost).toHaveBeenCalledWith('draft-record');
    expect(PubchiController.rejectDraftPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('pubchi-draft-post-revert')).toBeInTheDocument();
  });

  it('rejects without calling apply', async () => {
    vi.mocked(PubchiController.rejectDraftPost).mockResolvedValue();
    render(<PubchiAnswerCard answer={draftAnswer()} binding={draftBinding()} currentUserPubky={owner} />);

    fireEvent.click(screen.getByTestId('pubchi-draft-post-reject'));

    expect(await screen.findByTestId('pubchi-draft-post-rejected')).toHaveTextContent('Rejected');
    expect(PubchiController.rejectDraftPost).toHaveBeenCalledWith('draft-record');
    expect(PubchiController.applyDraftPost).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('renders Check again for an unknown apply outcome', async () => {
    vi.mocked(PubchiController.getDraftPostStatus).mockResolvedValue('reconciliation-pending');
    vi.mocked(PubchiController.reconcileDraftPost).mockResolvedValue('reconciliation-pending');
    render(<PubchiAnswerCard answer={draftAnswer()} binding={draftBinding()} currentUserPubky={owner} />);

    expect(
      await screen.findByText(
        'Pubchi could not confirm the result of this draft. Check again, or manage the post from your profile.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });
});

function draftAnswer(): PubchiAnswerV1 {
  const evidenceUri = `pubky://${owner}/pub/pubky.app/profile.json`;
  return {
    ...answer,
    section: 'draft_post',
    summary: 'A short post you can publish as yourself.',
    evidence: [
      {
        kind: 'user',
        label: 'Owner profile',
        uri: evidenceUri,
        claimants: [],
        claimant_count: 0,
        in_your_graph: true,
      },
    ],
    draft_post: {
      content: 'Pubky keeps public social state on your homeserver.',
      kind: 'short',
      tags: ['pubky-app'],
      rationale: 'Matches the public profile evidence.',
      evidence: [evidenceUri],
    },
  };
}

function draftBinding() {
  return {
    owner,
    bot: owner,
    servedPurpose: 'ask' as const,
    question: 'Draft a short post about Pubky',
    submitted_at: Date.now(),
    recordId: 'draft-record',
  };
}
