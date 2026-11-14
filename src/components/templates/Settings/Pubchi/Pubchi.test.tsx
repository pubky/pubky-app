import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBCHI_SETTINGS_SURFACE, PubchiSettings, saveBrain } from './Pubchi';

const dialogState = vi.hoisted(() => ({
  approvalResult: undefined as boolean | undefined,
}));

vi.mock('@/organisms/RingApprovalDialog/RingApprovalDialog', () => ({
  RingApprovalDialog: ({ open, onApproved }: { open: boolean; onApproved: (session: never) => Promise<boolean> }) =>
    open ? (
      <button
        type="button"
        data-testid="ring-approval-dialog"
        onClick={() => {
          void onApproved({} as never).then((result) => {
            dialogState.approvalResult = result;
          });
        }}
      />
    ) : null,
}));

const hookState = vi.hoisted(() => ({
  form: { control: {} },
  backupForm: { control: {} },
  submit: vi.fn(),
  confirmBackup: vi.fn(),
  openBackup: vi.fn(),
  closeBackup: vi.fn(),
  remove: vi.fn(),
  revokeDevice: vi.fn(),
  revokeAllDevices: vi.fn(),
  reapprove: vi.fn(),
  needsReapproval: false,
  binding: undefined,
  pubchi: undefined as
    | {
        bot: string;
        displayName: string;
        createdAt: number;
        verified: boolean;
        backupConfirmedAt: number | null;
      }
    | undefined,
  creating: false,
  backupOpen: false,
  backupPositions: [],
  backupController: { words: () => [] },
  devices: [] as Array<{
    schema: 'pubchi-device-delegation';
    version: 1;
    owner: string;
    signer: string;
    bot: string;
    purposes: Array<'ask' | 'who-tagged-me' | 'build-feed'>;
    created_at: number;
    expires_at: number;
    signature: string;
  }>,
  pendingRevocations: [] as string[],
  currentSigner: undefined as string | undefined,
  loading: false,
  enrollmentLoaded: true,
  enabled: true,
  context: null,
  contextEditable: true,
  config: undefined as
    | {
        display_name: string;
        tier: 'read-only' | 'assisted' | 'autonomous';
        brain: { execution: 'synonym-hosted' };
      }
    | undefined,
}));

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => hookState,
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/molecules/ControlledInputField/ControlledInputField', () => ({
  ControlledInputField: ({ label, placeholder }: { label: string; placeholder?: string }) => (
    <input aria-label={label} placeholder={placeholder} />
  ),
}));

vi.mock('@/organisms/Pubchi/PubchiPreferencesForm/PubchiPreferencesForm', () => ({
  PubchiPreferencesForm: () => null,
}));

describe('PubchiSettings', () => {
  beforeEach(() => {
    dialogState.approvalResult = undefined;
    hookState.needsReapproval = false;
    hookState.reapprove.mockReset();
    hookState.revokeDevice.mockReset();
    hookState.devices = [];
    hookState.pendingRevocations = [];
    hookState.currentSigner = undefined;
    hookState.context = null;
    hookState.contextEditable = true;
    hookState.config = undefined;
    hookState.enrollmentLoaded = true;
    hookState.pubchi = undefined;
  });

  it('mounts the production settings surface', () => {
    render(<PubchiSettings />);
    expect(screen.getByTestId(PUBCHI_SETTINGS_SURFACE)).toHaveAttribute('data-surface', PUBCHI_SETTINGS_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-create')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Name your Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('Create a Pubchi');
  });

  it('shows a skeleton until enrollment has resolved', () => {
    hookState.enrollmentLoaded = false;

    render(<PubchiSettings />);

    expect(screen.getByTestId('pubchi-settings-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-create')).not.toBeInTheDocument();
  });

  it('shows the persistent degraded state and disables enrollment until reapproval', () => {
    hookState.needsReapproval = true;

    render(<PubchiSettings />);

    expect(screen.getByTestId('pubchi-degraded-session')).toHaveTextContent(
      "Your sign-in predates Pubchi and can't reach its folders yet. Tap Re-approve and confirm in Pubky Ring.",
    );
    expect(screen.getByTestId('pubchi-create')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(screen.getByTestId('ring-approval-dialog')).toBeInTheDocument();
  });

  it('uses one approval dialog host for both reapproval triggers', () => {
    hookState.needsReapproval = true;
    hookState.contextEditable = false;
    hookState.pubchi = {
      bot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      displayName: 'Pubchi',
      createdAt: 1,
      verified: true,
      backupConfirmedAt: null,
    };
    hookState.config = {
      display_name: 'Pubchi',
      tier: 'read-only',
      brain: { execution: 'synonym-hosted' },
    };

    render(<PubchiSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(screen.getAllByTestId('ring-approval-dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve in Ring' }));
    expect(screen.getAllByTestId('ring-approval-dialog')).toHaveLength(1);
  });

  it.each([
    ['success', true],
    ['failure', false],
  ] as const)('passes the Ring adoption %s result to the dialog', async (_outcome, result) => {
    hookState.needsReapproval = true;
    hookState.reapprove.mockResolvedValue(result);

    render(<PubchiSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    fireEvent.click(screen.getByTestId('ring-approval-dialog'));

    await waitFor(() => expect(dialogState.approvalResult).toBe(result));
  });

  it('keeps the default public web context disabled on the first brain save', async () => {
    const saveConfig = vi.fn().mockResolvedValue(undefined);

    await saveBrain(
      {
        execution: 'synonym-hosted',
        provider_id: 'moonshot',
        model_id: 'kimi-k3',
        endpoint: null,
      },
      null,
      saveConfig,
    );

    expect(saveConfig).toHaveBeenCalledWith({
      brain: expect.objectContaining({ send_public_web_context: false }),
    });
  });

  it('renders remote signers, marks this browser, and revokes another signer', () => {
    const localSigner = 'ybndrfg8ejkmcpqxot1uwisza345h769ybndrfg8ejkmcpqxot1u';
    const remoteSigner = 'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy';
    hookState.currentSigner = localSigner;
    hookState.devices = [localSigner, remoteSigner].map((signer) => ({
      schema: 'pubchi-device-delegation',
      version: 1,
      owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
      signer,
      bot: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      purposes: ['ask', 'who-tagged-me', 'build-feed'],
      created_at: 1,
      expires_at: 2_000_000,
      signature: 'a'.repeat(128),
    }));

    render(<PubchiSettings />);

    expect(screen.getByTestId('pubchi-device-signers')).toHaveTextContent(`${localSigner} (this browser)`);
    expect(screen.getByTestId('pubchi-device-signers')).toHaveTextContent('Purposes: ask, who-tagged-me, build-feed');
    fireEvent.click(screen.getAllByRole('button', { name: 'Revoke' })[1]!);
    expect(hookState.revokeDevice).toHaveBeenCalledWith(remoteSigner);
  });

  it('reports local revocation while the homeserver DELETE is pending', () => {
    hookState.pendingRevocations = ['yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'];

    render(<PubchiSettings />);

    expect(screen.getByTestId('pubchi-pending-revocations')).toHaveTextContent(
      'Revoked on this device — homeserver revocation pending re-approval.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve to finish revocation' }));
    expect(screen.getByTestId('ring-approval-dialog')).toBeInTheDocument();
  });
});
