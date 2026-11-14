import { describe, expect, it } from 'vitest';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import { PubchiAnswerCard } from '@/organisms/Pubchi/PubchiAnswerCard/PubchiAnswerCard';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const owner = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';
const author = 'a1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const baseAnswer: PubchiAnswerV1 = {
  schema: 'pubchi-answer',
  version: 1,
  bot: owner,
  owner,
  generated_at: 1_700_000_000,
  run_id: 'vrt-answer',
  purpose: 'ask',
  question: 'What did I miss?',
  summary: 'You missed a reply from pubky:a1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo.',
  evidence: [
    {
      kind: 'post',
      label: 'A reply about Bitcoin',
      uri: `pubky://${author}/pub/pubky.app/posts/reply-1`,
      claimants: [author],
      claimant_count: 1,
      in_your_graph: true,
    },
  ],
  sources: [],
  tool_trace_summary: { tools: ['what_did_i_miss'], call_count: 1, truncated: false },
  policy_version: 1,
};

function answer(overrides: Partial<PubchiAnswerV1>): PubchiAnswerV1 {
  return { ...baseAnswer, ...overrides };
}

describe('PubchiAnswerCard — visual regression', () => {
  it('guards the production answer surface marker', async () => {
    const screen = await renderForVRT(<PubchiAnswerCard answer={baseAnswer} currentUserPubky={owner} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });

    const surface = screen.getByTestId('pubchi-answer');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-answer');
  });

  it('captures C3 complete', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          continuation: {
            since: '2026-09-10T06:00:00Z',
            until: '2026-09-10T07:00:00Z',
            complete: true,
            skipped: 0,
          },
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-c3-complete-desktop');
  });

  it('captures C3 partial cursor kept', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          continuation: {
            since: '2026-09-10T06:00:00Z',
            until: '2026-09-10T07:00:00Z',
            complete: false,
            skipped: 2,
          },
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-c3-partial-desktop');
  });

  it('captures C4 thread summary with linkified citation', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          question: `Summarize this thread https://pubky.app/post/${author}/root-1`,
          summary: `The thread discusses Bitcoin. See pubky:${author}.`,
          evidence: [
            {
              kind: 'post',
              label: 'Root post',
              uri: `pubky://${author}/pub/pubky.app/posts/root-1`,
              claimants: [author],
              claimant_count: 1,
              in_your_graph: null,
            },
            {
              kind: 'post',
              label: 'Reply',
              uri: `pubky://${owner}/pub/pubky.app/posts/reply-2`,
              claimants: [owner],
              claimant_count: 1,
              in_your_graph: null,
            },
          ],
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-c4-summary-desktop');
  });

  it('captures a scoped graph answer', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          summary: 'The graph contains no matching evidence.',
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
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-scoped-network-desktop');
  });

  it('captures a knowledge answer with citations', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
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
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-knowledge-citations-desktop');
  });

  it('captures a model answer without citations', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          basis: 'model',
          summary: 'From what I know, Pubky is a public-key social protocol.',
          scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-model-desktop');
  });

  it('captures a web answer heading', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          basis: 'web',
          summary: 'Recent coverage describes Pubky as a public-key social protocol.',
          evidence: [],
          sources: [],
          tool_trace_summary: { tools: [], call_count: 0, truncated: false },
          scope: { time: null, graph: { kind: 'none' }, filters: [], complete: true },
          citations: [{ kind: 'web', title: 'Pubky coverage', url: 'https://example.com/pubky' }],
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-web-desktop');
  });

  it('captures an explicit graph answer heading', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          basis: 'graph',
          summary: 'The graph contains no matching evidence.',
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
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-graph-heading-desktop');
  });

  it('captures a mixed graph and knowledge answer', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard
        answer={answer({
          basis: 'mixed',
          scope: { time: null, graph: { kind: 'whole_graph' }, filters: [], complete: true },
          citations: [{ kind: 'web', title: 'Current source', url: 'https://example.com/source' }],
        })}
        currentUserPubky={owner}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-answer'), 'pubchi-answer-mixed-desktop');
  });
});
