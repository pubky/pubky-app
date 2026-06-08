import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Human } from './Human';

const mockPush = vi.fn();
const mockToast = vi.fn();
const mockShowErrorToast = vi.fn();
const mockVerifySignupToken = vi.fn<(inviteCode: string) => Promise<boolean>>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('@/molecules/Toaster/showErrorToast', () => ({
  showErrorToast: (params: unknown) => mockShowErrorToast(params),
}));

vi.mock('@/controllers/auth/auth', () => ({
  AuthController: {
    verifySignupToken: (inviteCode: string) => mockVerifySignupToken(inviteCode),
    generateSignupToken: vi.fn(),
  },
}));

vi.mock('@/organisms/HumanInviteCode/HumanInviteCode', () => {
  return {
    HumanInviteCode: ({
      onVerify,
      onSuccess,
    }: {
      onVerify: (code: string) => Promise<boolean>;
      onSuccess: (code: string) => void;
    }) => (
      <button
        data-testid="human-invite-code"
        onClick={() => {
          void onVerify('YVB2-YFRN-GDY0').then((isValid) => {
            if (isValid) {
              onSuccess('YVB2-YFRN-GDY0');
            }
          });
        }}
      >
        Human Invite Code
      </button>
    ),
  };
});

vi.mock('@/organisms/HumanLightningPayment/HumanLightningPayment', () => {
  return {
    HumanLightningPayment: () => <div data-testid="human-lightning-payment">Human Lightning Payment</div>,
  };
});

vi.mock('@/organisms/HumanPhoneCode/HumanPhoneCode', () => {
  return {
    HumanPhoneCode: () => <div data-testid="human-phone-code">Human Phone Code</div>,
  };
});

vi.mock('@/organisms/HumanPhoneInput/HumanPhoneInput', () => {
  return {
    HumanPhoneInput: () => <div data-testid="human-phone-input">Human Phone Input</div>,
  };
});

vi.mock('@/organisms/HumanSelection/HumanSelection', () => {
  return {
    HumanSelection: ({ onInviteCodeClick }: { onInviteCodeClick: () => void }) => (
      <button data-testid="human-selection" onClick={onInviteCodeClick}>
        Human Selection
      </button>
    ),
  };
});

describe('Human template', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockToast.mockClear();
    mockShowErrorToast.mockClear();
    mockVerifySignupToken.mockReset();
    mockVerifySignupToken.mockResolvedValue(true);
  });

  it('renders all main components', () => {
    render(<Human />);

    expect(screen.getByTestId('human-selection')).toBeInTheDocument();
  });

  it('verifies a manually entered invite code, shows success toast and navigates to install', async () => {
    mockVerifySignupToken.mockResolvedValue(true);
    render(<Human />);

    fireEvent.click(screen.getByTestId('human-selection'));
    fireEvent.click(screen.getByTestId('human-invite-code'));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.INSTALL);
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Invite code applied',
      description: 'Your invite code YVB2-YFRN-GDY0 has been applied.',
    });
  });

  it('shows a warning toast and stays on the invite step when the code is invalid', async () => {
    mockVerifySignupToken.mockResolvedValue(false);
    render(<Human />);

    fireEvent.click(screen.getByTestId('human-selection'));
    fireEvent.click(screen.getByTestId('human-invite-code'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Invalid invite code',
        description: 'This invite code is invalid or has expired. Please use a valid invite code.',
      });
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    expect(mockShowErrorToast).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    // Still on the invite code step so the user can try again
    expect(screen.getByTestId('human-invite-code')).toBeInTheDocument();
  });

  it('shows an error toast and stays on the invite step when verification cannot reach the homeserver', async () => {
    mockVerifySignupToken.mockRejectedValue(new Error('network error'));
    render(<Human />);

    fireEvent.click(screen.getByTestId('human-selection'));
    fireEvent.click(screen.getByTestId('human-invite-code'));

    await waitFor(() => {
      expect(mockShowErrorToast).toHaveBeenCalledWith({
        title: "Couldn't verify invite code",
        description: "We couldn't verify your invite code right now. Please check your connection and try again.",
      });
    });
    expect(mockVerifySignupToken).toHaveBeenCalledWith('YVB2-YFRN-GDY0');
    // No invalid-code warning toast for transient errors, and no navigation
    expect(mockToast).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId('human-invite-code')).toBeInTheDocument();
  });
});

describe('Human template - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Human />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
