import { describe, expect, it } from 'vitest';
import { PubchiBrainPanel } from '@/organisms/Pubchi/PubchiBrainPanel/PubchiBrainPanel';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const hosted = {
  execution: 'synonym-hosted' as const,
  provider_id: 'moonshot' as const,
  model_id: 'kimi-k3' as const,
  endpoint: null,
};

describe('PubchiBrainPanel — visual regression', () => {
  it('guards the production brain panel surface marker', async () => {
    const screen = await renderForVRT(<PubchiBrainPanel value={hosted} onChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });

    const surface = screen.getByTestId('pubchi-brain-panel');
    await expect.element(surface).toHaveAttribute('data-surface', 'pubchi-brain-panel');
  });

  it('captures the hosted brain', async () => {
    const screen = await renderForVRT(<PubchiBrainPanel value={hosted} onChange={() => {}} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-brain-panel'), 'pubchi-brain-panel-hosted-desktop');
  });

  it('captures the self-hosted fields', async () => {
    const screen = await renderForVRT(
      <PubchiBrainPanel
        value={{
          execution: 'self-hosted',
          provider_id: 'ollama',
          model_id: 'llama3.2',
          endpoint: 'http://localhost:11434',
        }}
        onChange={() => {}}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-brain-panel'), 'pubchi-brain-panel-self-hosted-desktop');
  });

  it('captures enrolled private context', async () => {
    const screen = await renderForVRT(
      <PubchiBrainPanel
        value={hosted}
        context={{
          schema: 'pubchi-owner-context',
          version: 1,
          about: 'Bitcoin',
          instructions: 'Answer briefly',
          updated_at: 1_700_000_000,
        }}
        contextEditable
        onChange={() => {}}
        onSaveContext={() => {}}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-brain-panel'), 'pubchi-brain-panel-context-desktop');
  });

  it('captures read-only private context without the private capability', async () => {
    const screen = await renderForVRT(
      <PubchiBrainPanel
        value={hosted}
        context={{ schema: 'pubchi-owner-context', version: 1, about: 'Bitcoin', updated_at: 1_700_000_000 }}
        contextEditable={false}
        onChange={() => {}}
        onReapprove={() => {}}
      />,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );

    await matchVrtElementScreenshot(screen.getByTestId('pubchi-brain-panel'), 'pubchi-brain-panel-readonly-desktop');
  });
});
