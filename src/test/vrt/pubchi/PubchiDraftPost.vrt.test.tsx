/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { PubchiAnswerCard } from '@/organisms/Pubchi/PubchiAnswerCard/PubchiAnswerCard';
import type { PubchiRequestBinding } from '@/application/pubchi/pubchi.types';
import type { PubchiAnswerV1 } from '@/libs/pubchi/schemas/answer';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { asOpaque } from '@/test-utils/type-assertions';
import answerFixture from '@/libs/pubchi/schemas/__fixtures__/c6/valid/answer__c6-valid.json';

import { PubchiController } from '@/controllers/pubchi/pubchi';

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectSession: () => ({ info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] } }),
    }),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/user/user', () => ({
  UserController: { getOrFetch: vi.fn(async () => undefined) },
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    getDraftPostStatus: vi.fn(async () => 'proposed'),
    applyDraftPost: vi.fn(),
    rejectDraftPost: vi.fn(),
    revertDraftPost: vi.fn(),
    reconcileDraftPost: vi.fn(),
    getTagSuggestionStatuses: vi.fn(async () => ({})),
  },
}));

const typedAnswer = asOpaque<PubchiAnswerV1>(answerFixture);
const binding: PubchiRequestBinding = {
  owner: answerFixture.owner,
  bot: answerFixture.bot,
  servedPurpose: 'ask',
  question: answerFixture.question,
  submitted_at: Date.now(),
  recordId: 'vrt-draft-record',
};

describe('Pubchi C6 draft post — visual regression', () => {
  it('renders the production draft card on desktop', async () => {
    vi.mocked(PubchiController.getDraftPostStatus).mockResolvedValue('proposed');
    const screen = await renderForVRT(
      <PubchiAnswerCard answer={typedAnswer} binding={binding} currentUserPubky={answerFixture.owner} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect.element(screen.getByTestId('pubchi-draft-post')).toBeVisible();
    expect(document.querySelector('[data-surface="pubchi-draft-post"]')).toBeTruthy();
    expect(document.querySelector('[data-surface="pubchi-answer"]')).toBeTruthy();
    await matchVrtFrameScreenshot('pubchi-draft-post-proposed-desktop');
  });

  it('renders the production draft card on mobile', async () => {
    vi.mocked(PubchiController.getDraftPostStatus).mockResolvedValue('proposed');
    await renderForVRT(
      <PubchiAnswerCard answer={typedAnswer} binding={binding} currentUserPubky={answerFixture.owner} />,
      { viewport: VRT_VIEWPORT_MOBILE },
    );
    await matchVrtFrameScreenshot('pubchi-draft-post-proposed-mobile');
  });

  it('renders the applied draft card on desktop', async () => {
    vi.mocked(PubchiController.getDraftPostStatus).mockResolvedValue('applied');
    const screen = await renderForVRT(
      <PubchiAnswerCard answer={typedAnswer} binding={binding} currentUserPubky={answerFixture.owner} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect.element(screen.getByTestId('pubchi-draft-post-revert')).toBeVisible();
    await matchVrtFrameScreenshot('pubchi-draft-post-applied-desktop');
  });

  it('renders the rejected draft card on desktop', async () => {
    vi.mocked(PubchiController.getDraftPostStatus).mockResolvedValue('rejected');
    const screen = await renderForVRT(
      <PubchiAnswerCard answer={typedAnswer} binding={binding} currentUserPubky={answerFixture.owner} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect.element(screen.getByTestId('pubchi-draft-post-rejected')).toBeVisible();
    await matchVrtFrameScreenshot('pubchi-draft-post-rejected-desktop');
  });
});
