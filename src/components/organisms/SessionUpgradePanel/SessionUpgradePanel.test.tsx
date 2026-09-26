import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionUpgradePanel } from './SessionUpgradePanel';

const mocks = vi.hoisted(() => ({
  fetchUrl: vi.fn(),
  onAuthorizeClick: vi.fn(),
  copyToClipboard: vi.fn(),
  toast: vi.fn(),
  auth: {
    url: '' as string,
    isLoading: false,
    isExpired: false,
    isOpeningRing: false,
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
    mocks.auth = { url: '', isLoading: false, isExpired: false, isOpeningRing: false };
  });

  it('starts an upgrade flow, not a sign-in', () => {
    render(<SessionUpgradePanel />);
    expect(mocks.options).toEqual({ type: 'upgrade' });
  });

  it('renders the QR and enables the touch button once the URL is ready', () => {
    mocks.auth.url = 'pubkyring://authorize?token=upgrade';
    render(<SessionUpgradePanel />);
    expect(screen.getByTestId('session-upgrade-qr').querySelector('svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeEnabled();
  });

  it('opens Pubky Ring from the touch button', () => {
    mocks.auth.url = 'pubkyring://authorize?token=upgrade';
    render(<SessionUpgradePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Continue with Pubky Ring' }));
    expect(mocks.onAuthorizeClick).toHaveBeenCalled();
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

  it('disables the touch button while the URL is generating', () => {
    mocks.auth.isLoading = true;
    render(<SessionUpgradePanel />);
    expect(screen.getByRole('button', { name: /Generating/ })).toBeDisabled();
  });
});

describe('SessionUpgradePanel - Snapshots', () => {
  beforeEach(() => {
    mocks.auth = {
      url: 'pubkyring://authorize?token=upgrade',
      isLoading: false,
      isExpired: false,
      isOpeningRing: false,
    };
  });

  it('matches snapshot with a ready URL', () => {
    const { container } = render(<SessionUpgradePanel />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot while generating', () => {
    mocks.auth = { url: '', isLoading: true, isExpired: false, isOpeningRing: false };
    const { container } = render(<SessionUpgradePanel />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
