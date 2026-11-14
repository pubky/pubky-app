/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { PubchiAnswerCard } from '@/organisms/Pubchi/PubchiAnswerCard/PubchiAnswerCard';
import { PubchiAppliedTagSuggestions } from '@/organisms/Pubchi/PubchiAppliedTagSuggestions/PubchiAppliedTagSuggestions';
import type { DiscoveredTagSuggestion, PubchiRequestBinding } from '@/application/pubchi/pubchi.types';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { asOpaque } from '@/test-utils/type-assertions';
import answerFixture from '@/libs/pubchi/schemas/__fixtures__/c5/valid/answer__c5-valid.json';

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectSession: () => ({ info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] } }),
    }),
}));

vi.mock('@/libs/pubchi/tag-application', () => ({
  canApplyTagSuggestion: vi.fn(() => false),
  tagApplicationBinding: vi.fn(),
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: { getOrFetch: vi.fn(async () => undefined) },
}));

const answer = {
  ...answerFixture,
  summary: 'One safe tag suggestion was found for this profile.',
  evidence: [answerFixture.target.uri],
  tag_suggestions: [
    {
      label: 'pubky-app',
      rationale: 'Matches the profile and its public activity.',
      evidence: [answerFixture.target.uri],
      already_applied: false,
      source: 'vocab',
    },
  ],
  target: { ...answerFixture.target, snapshot_sha256: 'a'.repeat(64) },
};
const typedAnswer = asOpaque<PubchiAnswerV1>(answer);

const binding: PubchiRequestBinding = {
  owner: answer.owner,
  bot: answer.bot,
  servedPurpose: 'ask' as const,
  question: answer.question,
  target: typedAnswer.target!,
  submitted_at: Date.now(),
  recordId: 'vrt-record',
};

const discoveredSuggestions: DiscoveredTagSuggestion[] = [
  {
    applicationId: 'a'.repeat(64),
    owner: answer.owner,
    target: typedAnswer.target!,
    label: 'pubky-app',
    status: 'applied',
    alreadyExisted: false,
  },
  {
    applicationId: 'b'.repeat(64),
    owner: answer.owner,
    target: typedAnswer.target!,
    label: 'local-first',
    status: 'superseded',
    alreadyExisted: true,
  },
];

describe('Pubchi C5 tag suggestions — visual regression', () => {
  it('renders the production answer card on desktop', async () => {
    const screen = await renderForVRT(
      <PubchiAnswerCard answer={typedAnswer} binding={binding} currentUserPubky={answer.owner} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect.element(screen.getByTestId('pubchi-tag-suggestion-0')).toBeVisible();
    expect(document.querySelector('[data-surface="pubchi-answer"]')).toBeTruthy();
    await matchVrtFrameScreenshot('pubchi-tag-suggestions-desktop');
  });

  it('renders the production answer card on mobile', async () => {
    await renderForVRT(<PubchiAnswerCard answer={typedAnswer} binding={binding} currentUserPubky={answer.owner} />, {
      viewport: VRT_VIEWPORT_MOBILE,
    });
    await matchVrtFrameScreenshot('pubchi-tag-suggestions-mobile');
  });

  it('renders discovered target receipts on desktop', async () => {
    const screen = await renderForVRT(
      <PubchiAppliedTagSuggestions suggestions={discoveredSuggestions} onRevert={() => {}} onReconcile={() => {}} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect.element(screen.getByTestId('pubchi-applied-section')).toBeVisible();
    expect(document.querySelector('[data-surface="pubchi-applied-section"]')).toBeTruthy();
    await matchVrtFrameScreenshot('pubchi-applied-tag-suggestions-desktop');
  });
});
