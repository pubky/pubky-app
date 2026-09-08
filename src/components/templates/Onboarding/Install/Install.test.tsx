import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ROUTES } from '@/app/routes';
import { toast } from '@/molecules/Toaster/toast';
import { Install } from './Install';

const mockSearchParamsGet = vi.fn<(key: string) => string | null>(() => null);
const mockSetInviteCode = vi.fn();
const mockReplace = vi.fn();
const mockVerifySignupToken = vi.fn<(inviteCode: string) => Promise<'valid' | 'used' | 'invalid'>>();

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    verifySignupToken: (inviteCode: string) => mockVerifySignupToken(inviteCode),
  },
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: {
    getState: () => ({
      setInviteCode: mockSetInviteCode,
    }),
  },
}));

vi.mock('@/molecules/Install/Install', () => {
  return {
    InstallNavigation: () => <div data-testid="install-navigation">Install Navigation</div>,
    InstallHeader: () => <div data-testid="install-header">Install Header</div>,
    InstallCard: () => <div data-testid="install-card">Install Card</div>,
    InstallFooter: () => <div data-testid="install-footer">Install Footer</div>,
  };
});

vi.mock('@/molecules/OnboardingLayout/OnboardingLayout', () => {
  return {
    OnboardingLayout: ({ children }: { children: ReactNode }) => <div data-testid="install-layout">{children}</div>,
  };
});

vi.mock('@/molecules/Toaster/toast');

describe('Install template', () => {
  beforeEach(() => {
    mockSearchParamsGet.mockReset();
    mockSearchParamsGet.mockReturnValue(null);
    vi.mocked(toast).mockClear();
    mockSetInviteCode.mockClear();
    mockReplace.mockClear();
    mockVerifySignupToken.mockReset();
    mockVerifySignupToken.mockResolvedValue('valid');
  });

  it('renders install onboarding content', () => {
    render(<Install />);

    expect(screen.getByTestId('install-layout')).toBeInTheDocument();
    expect(screen.getByTestId('install-header')).toBeInTheDocument();
    expect(screen.getByTestId('install-card')).toBeInTheDocument();
    expect(screen.getByTestId('install-footer')).toBeInTheDocument();
  });

  it('applies invite code from URL and shows toast when the code is valid', async () => {
    mockSearchParamsGet.mockReturnValueOnce('YVB2-YFRN-GDY0');
    mockVerifySignupToken.mockResolvedValue('valid');
    render(<Install />);

    await waitFor(() => {
      expect(mockSetInviteCode).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Invite code applied',
    });
    expect(mockReplace).not.toHaveBeenCalled();
    // Stays on the install page with the install content visible
    expect(screen.getByTestId('install-card')).toBeInTheDocument();
  });

  it('does not apply the invite code and redirects home when the code is invalid', async () => {
    mockSearchParamsGet.mockReturnValueOnce('YVB2-YFRN-GDY0');
    mockVerifySignupToken.mockResolvedValue('invalid');
    render(<Install />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTES);
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(mockSetInviteCode).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      title: 'Invalid invite code',
    });
  });

  it('does not apply the invite code and redirects home when the code has already been used', async () => {
    mockSearchParamsGet.mockReturnValueOnce('YVB2-YFRN-GDY0');
    mockVerifySignupToken.mockResolvedValue('used');
    render(<Install />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTES);
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(mockSetInviteCode).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      title: 'Invite code already used',
    });
  });

  it('shows an error toast and redirects home when verification fails to reach the homeserver', async () => {
    mockSearchParamsGet.mockReturnValueOnce('YVB2-YFRN-GDY0');
    mockVerifySignupToken.mockRejectedValue(new Error('network error'));
    render(<Install />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(ROOT_ROUTES);
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(mockSetInviteCode).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      title: "Couldn't verify invite code",
    });
    // The invalid-code error toast is not shown for transient errors.
    expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
  });

  it('does not verify or set invite code when URL param is missing', () => {
    render(<Install />);

    expect(mockVerifySignupToken).not.toHaveBeenCalled();
    expect(mockSetInviteCode).not.toHaveBeenCalled();
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });
});

describe('Install template - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Install />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
