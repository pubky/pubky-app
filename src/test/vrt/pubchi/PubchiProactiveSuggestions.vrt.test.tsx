import { describe, expect, it } from 'vitest';
import type { PubchiSuggestionV1 } from '@/libs/pubchi/schemas/suggestion';
import { PubchiProactiveSuggestions } from '@/organisms/Pubchi/PubchiProactiveSuggestions/PubchiProactiveSuggestions';
import { matchVrtFrameScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const suggestion: PubchiSuggestionV1 = {
  schema: 'pubchi-suggestion',
  version: 1,
  bot: owner,
  owner,
  updated_at: 1_780_000_000,
  suggestion_id: 'what-i-missed-20260921',
  kind: 'what-i-missed',
  title: 'Three threads worth revisiting',
  summary: 'A short summary derived only from the cited public objects.',
  source_uris: [`pubky://${owner}/pub/pubky.app/profile.json`],
  run_id: 'run-01',
  expires_at: 1_780_604_800,
};

describe('Pubchi proactive suggestions — visual regression', () => {
  it('renders the production surface on desktop', async () => {
    const screen = await renderForVRT(
      <PubchiProactiveSuggestions suggestions={[suggestion]} currentUserPubky={owner} onDismiss={() => undefined} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect.element(screen.getByTestId('pubchi-proactive-suggestions')).toBeVisible();
    expect(document.querySelector('[data-surface="pubchi-proactive-suggestions"]')).toBeTruthy();
    await matchVrtFrameScreenshot('pubchi-proactive-suggestions-desktop');
  });

  it('renders the production surface on mobile', async () => {
    await renderForVRT(
      <PubchiProactiveSuggestions suggestions={[suggestion]} currentUserPubky={owner} onDismiss={() => undefined} />,
      { viewport: VRT_VIEWPORT_MOBILE },
    );
    await matchVrtFrameScreenshot('pubchi-proactive-suggestions-mobile');
  });
});
