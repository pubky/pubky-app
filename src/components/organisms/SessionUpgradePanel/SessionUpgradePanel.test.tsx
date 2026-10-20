import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BITKIT_WEBSITE_URL, getPubkyRingLink } from '@/config/externalLinks';
import { SessionUpgradeDescription, SessionUpgradePanel } from './SessionUpgradePanel';

const mocks = vi.hoisted(() => ({
  fetchUrl: vi.fn(),
  onAuthorizeClick: vi.fn(),
  onAuthorizeBitkitClick: vi.fn(),
  copyToClipboard: vi.fn(),
  toast: vi.fn(),
  auth: {
    url: '' as string,
    isLoading: false,
    isExpired: false,
    isOpeningRing: false,
    isOpeningBitkit: false,
  },
  options: null as unknown,
}));

vi.mock('@/hooks/useMobileAuth/useMobileAuth', () => ({
  useMobileAuth: (options: unknown) => {
    mocks.options = options;
    return {
      ...mocks.auth,
      fetchUrl: mocks.fetchUrl,
      copyAuthUrl: vi.fn(),
      onAuthorizeClick: mocks.onAuthorizeClick,
      onAuthorizeBitkitClick: mocks.onAuthorizeBitkitClick,
    };
  },
}));

vi.mock('@/libs/utils/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/utils/utils')>();
  return { ...actual, copyToClipboard: (args: { text: string }) => mocks.copyToClipboard(args) };
});
vi.mock('@/molecules/Toaster/toast', () => ({ toast: (args: unknown) => mocks.toast(args) }));

describe('SessionUpgradePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth = { url: '', isLoading: false, isExpired: false, isOpeningRing: false, isOpeningBitkit: false };
  });

  it('starts an upgrade flow, not a sign-in', () => {
    render(<SessionUpgradePanel />);
    expect(mocks.options).toEqual({ type: 'upgrade' });
  });

  it('passes the requested Shop capabilities to the same upgrade flow', () => {
    const requiredCapabilities = ['/pub/paykit/:rw', '/priv/pubky.app/:rw'];
    render(<SessionUpgradePanel requiredCapabilities={requiredCapabilities} />);
    expect(mocks.options).toEqual({ type: 'upgrade', requiredCapabilities });
  });

  it('names both signers in the Locks description', () => {
    render(<SessionUpgradeDescription />);
    expect(screen.getByRole('link', { name: 'Pubky Ring' })).toHaveAttribute('href', getPubkyRingLink());
    expect(screen.getByRole('link', { name: 'Bitkit' })).toHaveAttribute('href', BITKIT_WEBSITE_URL);
    expect(screen.getByText(/to authorize Pubky.app to access your private Locks data/)).toBeInTheDocument();
  });

  it('renders the QR and enables both touch buttons once the URL is ready', () => {
    mocks.auth.url = 'pubkyring://authorize?token=upgrade';
    render(<SessionUpgradePanel />);
    expect(screen.getByTestId('session-upgrade-qr').querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeEnabled();
  });

  it('opens Pubky Ring from the touch button', () => {
    mocks.auth.url = 'pubkyring://authorize?token=upgrade';
    render(<SessionUpgradePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Pubky Ring' }));
    expect(mocks.onAuthorizeClick).toHaveBeenCalled();
  });

  it('opens Bitkit from its own touch button', () => {
    mocks.auth.url = 'pubkyauth://signin_grant?token=upgrade';
    render(<SessionUpgradePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Bitkit' }));
    expect(mocks.onAuthorizeBitkitClick).toHaveBeenCalledOnce();
    expect(mocks.onAuthorizeClick).not.toHaveBeenCalled();
  });

  it.each([
    { signer: 'Pubky Ring', opening: 'isOpeningRing', other: 'Bitkit' },
    { signer: 'Bitkit', opening: 'isOpeningBitkit', other: 'Pubky Ring' },
  ] as const)('keeps $other available while $signer is opening', ({ signer, opening, other }) => {
    mocks.auth.url = 'pubkyauth://signin_grant?token=upgrade';
    mocks.auth[opening] = true;
    render(<SessionUpgradePanel />);
    const openingButton = screen.getByRole('button', { name: `Opening ${signer}...` });
    expect(openingButton).toBeDisabled();
    expect(openingButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: `Continue with ${other}` })).toBeEnabled();
  });

  it('disables both signer buttons before a usable URL is available', () => {
    render(<SessionUpgradePanel />);
    expect(screen.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeDisabled();
  });

  it('copies the link when the QR is clicked', async () => {
    mocks.auth = { ...mocks.auth, url: 'pubkyauth://upgrade' };
    mocks.copyToClipboard.mockResolvedValue(undefined);
    render(<SessionUpgradePanel />);

    fireEvent.click(screen.getByTestId('session-upgrade-qr'));

    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'info', title: 'Authorization link copied' }),
    );
    expect(mocks.copyToClipboard).toHaveBeenCalledWith({ text: 'pubkyauth://upgrade' });
  });

  // A rejected clipboard write must not be reported as copied.
  it('reports a failed copy', async () => {
    mocks.auth = { ...mocks.auth, url: 'pubkyauth://upgrade' };
    mocks.copyToClipboard.mockRejectedValue(new Error('denied'));
    render(<SessionUpgradePanel />);

    fireEvent.click(screen.getByTestId('session-upgrade-qr'));

    await vi.waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not copy to clipboard' }),
    );
  });

  it('reloads the flow from the expired QR', () => {
    mocks.auth.isExpired = true;
    render(<SessionUpgradePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload authorization QR code' }));
    expect(mocks.fetchUrl).toHaveBeenCalled();
  });

  it('disables both touch buttons while the URL is generating', () => {
    mocks.auth.isLoading = true;
    render(<SessionUpgradePanel />);
    const buttons = screen.getAllByRole('button', { name: 'Generating...' });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-busy', 'true');
    }
  });
});
