import { describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings } from '@/templates/Settings/Pubchi/Pubchi';
import { matchVrtElementScreenshot, renderForVRT } from '@/test-utils/vrt';
import { VRT_FROZEN_NOW_MS } from '@/test-utils/vrt.clock';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const BOT = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const THIS_SIGNER = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u';
const OTHER_SIGNER = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';

const enrollment = {
  form: { control: {} },
  submit: vi.fn(),
  remove: vi.fn(),
  revokeDevice: vi.fn(),
  revokeAllDevices: vi.fn(),
  reapprove: vi.fn(),
  needsReapproval: false,
  binding: undefined as
    | {
        schema: 'pubchi-owner-binding';
        version: 1;
        owner: string;
        bot: string;
        status: 'active';
        created_at: number;
        updated_at: number;
      }
    | undefined,
  pubchi: undefined as
    | {
        bot: string;
        displayName: string;
        createdAt: number;
        backupConfirmedAt: number | null;
        verified: boolean;
      }
    | undefined,
  config: undefined as
    | {
        display_name: string;
        tier: 'read-only' | 'assisted' | 'autonomous';
        brain: {
          execution: 'synonym-hosted';
          provider_id: 'moonshot';
          model_id: string;
          endpoint: null;
          adapter: 'vercel-ai';
          send_public_graph_context: boolean;
          send_public_web_context: boolean;
        };
      }
    | undefined,
  saveConfig: vi.fn(),
  acceptSavedConfig: vi.fn(),
  devices: [] as Array<{
    owner: string;
    signer: string;
    bot: string;
    purposes: Array<'ask' | 'who-tagged-me' | 'build-feed'>;
    created_at: number;
    expires_at: number;
    schema: 'pubchi-device-delegation';
    signature: string;
    version: 1;
  }>,
  currentSigner: THIS_SIGNER as string | undefined,
  loading: false,
  enrollmentLoaded: true,
  enabled: true,
};

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => enrollment,
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    loadPubchiConfig: vi.fn().mockResolvedValue(null),
    savePubchiConfig: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('@/molecules/ControlledInputField/ControlledInputField', () => ({
  ControlledInputField: () => <input aria-label="Bot pubky" />,
}));

function bindWithDevices() {
  enrollment.needsReapproval = false;
  enrollment.binding = {
    schema: 'pubchi-owner-binding',
    version: 1,
    owner: OWNER,
    bot: BOT,
    status: 'active',
    created_at: Math.floor(VRT_FROZEN_NOW_MS / 1000) - 86_400,
    updated_at: Math.floor(VRT_FROZEN_NOW_MS / 1000),
  };
  enrollment.devices = [
    {
      owner: OWNER,
      signer: THIS_SIGNER,
      bot: BOT,
      purposes: ['ask', 'who-tagged-me', 'build-feed'],
      created_at: Math.floor(VRT_FROZEN_NOW_MS / 1000) - 86_400,
      expires_at: Math.floor(VRT_FROZEN_NOW_MS / 1000) + 30 * 86_400,
      schema: 'pubchi-device-delegation',
      signature: 'a'.repeat(128),
      version: 1,
    },
    {
      owner: OWNER,
      signer: OTHER_SIGNER,
      bot: BOT,
      purposes: ['ask'],
      created_at: Math.floor(VRT_FROZEN_NOW_MS / 1000) - 2 * 86_400,
      expires_at: Math.floor(VRT_FROZEN_NOW_MS / 1000) + 20 * 86_400,
      schema: 'pubchi-device-delegation',
      signature: 'b'.repeat(128),
      version: 1,
    },
  ];
  enrollment.currentSigner = THIS_SIGNER;
}

function botWithPanels() {
  enrollment.binding = undefined;
  enrollment.pubchi = {
    bot: BOT,
    displayName: 'Pubchi',
    createdAt: Math.floor(VRT_FROZEN_NOW_MS / 1000) - 86_400,
    backupConfirmedAt: Math.floor(VRT_FROZEN_NOW_MS / 1000),
    verified: true,
  };
  enrollment.config = {
    display_name: 'Pubchi',
    tier: 'assisted',
    brain: {
      adapter: 'vercel-ai',
      execution: 'synonym-hosted',
      provider_id: 'moonshot',
      model_id: 'kimi-k3',
      endpoint: null,
      send_public_graph_context: true,
      send_public_web_context: true,
    },
  };
  enrollment.devices = [];
}

describe('PubchiSettings — visual regression', () => {
  it('guards the production surface marker', async () => {
    bindWithDevices();
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    const surface = screen.getByTestId(PUBCHI_SETTINGS_SURFACE);
    await expect.element(surface).toHaveAttribute('data-surface', PUBCHI_SETTINGS_SURFACE);
    await expect.element(screen.getByTestId('pubchi-device-signers')).toBeVisible();
  });

  it('captures the production settings surface with live device signers', async () => {
    bindWithDevices();
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtElementScreenshot(screen.getByTestId(PUBCHI_SETTINGS_SURFACE), 'pubchi-settings-desktop');
  });

  it('captures the no-bot production settings surface', async () => {
    enrollment.binding = undefined;
    enrollment.pubchi = undefined;
    enrollment.config = undefined;
    enrollment.devices = [];
    enrollment.currentSigner = undefined;
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtElementScreenshot(screen.getByTestId(PUBCHI_SETTINGS_SURFACE), 'pubchi-settings-no-bot-desktop');
  });

  it('captures the bot production settings surface with panels', async () => {
    botWithPanels();
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtElementScreenshot(screen.getByTestId(PUBCHI_SETTINGS_SURFACE), 'pubchi-settings-bot-panels-desktop');
  });

  it('captures Ring re-approval on the production settings surface', async () => {
    bindWithDevices();
    enrollment.needsReapproval = true;
    const screen = await renderForVRT(<PubchiSettings />, { viewport: VRT_VIEWPORT_DESKTOP });
    await matchVrtElementScreenshot(screen.getByTestId(PUBCHI_SETTINGS_SURFACE), 'pubchi-settings-reapprove-desktop');
  });
});
