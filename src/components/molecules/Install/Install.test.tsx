import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { BITKIT_APP_STORE_URL, BITKIT_PLAY_STORE_URL } from '@/config/externalLinks';
import type { DeployEnv } from '@/libs/runtime-config/runtime-config.schema';
import { InstallHeader, InstallKeychains } from './Install';

// Mock Next.js Image
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => (
    <img src={src} alt={alt} {...props} />
  ),
}));

const { network } = vi.hoisted(() => ({ network: { deployEnv: 'production' as DeployEnv } }));
vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  getDeployEnv: () => network.deployEnv,
}));

// Mock Next.js router
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile';

describe('InstallHeader', () => {
  it('asks the user to pick a keychain', () => {
    render(<InstallHeader />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pick your keychain.');
    expect(screen.getByText('Install a keychain for your identity keys.')).toBeInTheDocument();
  });
});

describe('InstallKeychains', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    network.deployEnv = 'production';
    vi.stubGlobal('navigator', { userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers Pubky Ring and Bitkit, with no in-browser key creation', () => {
    render(<InstallKeychains />);

    expect(screen.getByTestId('install-keychain-ring')).toBeInTheDocument();
    expect(screen.getByTestId('install-keychain-bitkit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Pubky Ring' })).toHaveAttribute(
      'id',
      'continue-with-pubky-ring-btn',
    );
    expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toHaveAttribute(
      'id',
      'continue-with-bitkit-btn',
    );
    expect(screen.queryByRole('button', { name: /Create keys in browser/i })).not.toBeInTheDocument();
  });

  it('links the Bitkit store badges to the Bitkit listings', () => {
    render(<InstallKeychains />);

    expect(screen.getByAltText('Download Bitkit on the App Store').closest('a')).toHaveAttribute(
      'href',
      BITKIT_APP_STORE_URL,
    );
    expect(screen.getByAltText('Get Bitkit on Google Play').closest('a')).toHaveAttribute(
      'href',
      BITKIT_PLAY_STORE_URL,
    );
  });

  it('shows no Bitkit store badges on staging, whose sign-up opens the regtest build', () => {
    network.deployEnv = 'staging';

    render(<InstallKeychains />);

    expect(screen.queryByAltText('Download Bitkit on the App Store')).not.toBeInTheDocument();
    expect(screen.queryByAltText('Get Bitkit on Google Play')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Bitkit' })).toBeEnabled();
    expect(screen.getAllByAltText('App Store').length).toBeGreaterThan(0);
    expect(screen.getAllByAltText('Google Play').length).toBeGreaterThan(0);
  });

  it('continues to the Pubky Ring scan step', () => {
    render(<InstallKeychains />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Pubky Ring' }));

    expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.SCAN);
  });

  it('continues to the Bitkit scan step', () => {
    render(<InstallKeychains />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Bitkit' }));

    expect(mockPush).toHaveBeenCalledWith(`${ONBOARDING_ROUTES.SCAN}?keychain=bitkit`);
  });

  it('disables both keychains once one is picked', () => {
    render(<InstallKeychains />);

    const ringButton = screen.getByRole('button', { name: 'Continue with Pubky Ring' });
    const bitkitButton = screen.getByRole('button', { name: 'Continue with Bitkit' });
    expect(ringButton).toBeEnabled();
    expect(bitkitButton).toBeEnabled();

    fireEvent.click(ringButton);

    expect(ringButton).toBeDisabled();
    expect(bitkitButton).toBeDisabled();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('offers only Pubky Ring on iOS, where Bitkit cannot open a sign-up request from a link', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 });

    render(<InstallKeychains />);

    expect(screen.getByRole('button', { name: 'Continue with Pubky Ring' })).toBeInTheDocument();
    expect(screen.queryByTestId('install-keychain-bitkit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue with Bitkit' })).not.toBeInTheDocument();
  });
});
