import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROOT_ROUTES } from '@/app/routes';
import { Install } from './Install';

const mockSearchParamsGet = vi.fn<(key: string) => string | null>(() => null);
const mockToast = vi.fn();
const mockShowErrorToast = vi.fn();
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

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    useToast: () => ({
      toast: mockToast,
    }),
  };
});

vi.mock('@/molecules/Toaster/showErrorToast', () => {
  return {
    showErrorToast: (params: unknown) => mockShowErrorToast(params),
  };
});

describe('Install template', () => {
  beforeEach(() => {
    mockSearchParamsGet.mockReset();
    mockSearchParamsGet.mockReturnValue(null);
    mockToast.mockClear();
    mockShowErrorToast.mockClear();
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
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Invite code applied',
      description: 'Your invite code YVB2-YFRN-GDY0 has been applied.',
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
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Invalid invite code',
      description: 'This invite code is not recognized. Please use a different invite code.',
    });
    expect(mockShowErrorToast).not.toHaveBeenCalled();
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
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Invite code already used',
      description: 'This invite code has already been used. Please use a different invite code.',
    });
    expect(mockShowErrorToast).not.toHaveBeenCalled();
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
    expect(mockShowErrorToast).toHaveBeenCalledWith({
      title: "Couldn't verify invite code",
      description: "We couldn't verify your invite code right now. Please check your connection and try again.",
    });
    // The invalid-code warning toast is not shown for transient errors
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('does not verify or set invite code when URL param is missing', () => {
    render(<Install />);

    expect(mockVerifySignupToken).not.toHaveBeenCalled();
    expect(mockSetInviteCode).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });
});

describe('Install template - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Install />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
