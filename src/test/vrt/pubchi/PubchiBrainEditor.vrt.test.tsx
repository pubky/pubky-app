import { describe, expect, it } from 'vitest';
import { PubchiBrainEditor } from '@/organisms/Pubchi/PubchiBrainEditor/PubchiBrainEditor';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const context = {
  schema: 'pubchi-owner-context' as const,
  version: 1 as const,
  about: 'Bitcoin developer in Lisbon; care about Lightning, self-custody, Pubky.',
  instructions: 'Two sentences max. Mention Lightning when relevant. Portuguese is fine.',
  updated_at: 1_700_000_000,
};

describe('PubchiBrainEditor — visual regression', () => {
  it('guards the editable production editor surface', async () => {
    const screen = await renderForVRT(
      <PubchiBrainEditor context={context} contextEditable onSaveContext={() => {}} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect
      .element(screen.getByTestId('pubchi-brain-editor'))
      .toHaveAttribute('data-surface', 'pubchi-brain-editor');
  });

  it('guards the gated production editor surface', async () => {
    const screen = await renderForVRT(
      <PubchiBrainEditor context={context} contextEditable={false} onReapprove={() => {}} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await expect
      .element(screen.getByTestId('pubchi-brain-editor'))
      .toHaveAttribute('data-surface', 'pubchi-brain-editor');
  });

  it('captures editable brain editor', async () => {
    const screen = await renderForVRT(
      <PubchiBrainEditor context={context} contextEditable onSaveContext={() => {}} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-brain-editor'), 'pubchi-brain-editor-editable-desktop');
  });

  it('captures gated brain editor', async () => {
    const screen = await renderForVRT(
      <PubchiBrainEditor context={context} contextEditable={false} onReapprove={() => {}} />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await matchVrtElementScreenshot(screen.getByTestId('pubchi-brain-editor'), 'pubchi-brain-editor-gated-desktop');
  });
});
