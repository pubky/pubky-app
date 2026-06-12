import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { Human } from './Human';

const mockPush = vi.fn();
const mockToast = vi.fn();
const mockResetOnboarding = vi.fn();
const mockSetInviteCode = vi.fn();
const mockVerifySignupToken = vi.fn<(inviteCode: string) => Promise<'valid' | 'used' | 'invalid'>>();

const INVITE_CODE = 'YVB2-YFRN-GDY0';

const INVITE_CODE_TOASTS = {
  valid: {
    title: 'Invite code applied',
    description: `Your invite code ${INVITE_CODE} has been applied.`,
  },
  invalid: {
    title: 'Invalid invite code',
    description: 'This invite code is not recognized. Please use a different invite code.',
  },
  used: {
    title: 'Invite code already used',
    description: 'This invite code has already been used. Please use a different invite code.',
  },
  verificationFailed: {
    variant: 'error',
    title: "Couldn't verify invite code",
    description: "We couldn't verify your invite code right now. Please check your connection and try again.",
  },
} as const;

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

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: () => ({
    reset: mockResetOnboarding,
    setInviteCode: mockSetInviteCode,
  }),
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
      onVerify: (code: string) => Promise<'valid' | 'invalid' | 'used' | 'error'>;
      onSuccess: (code: string) => void;
    }) => (
      <button
        data-testid="human-invite-code"
        onClick={() => {
          void onVerify(INVITE_CODE).then((result) => {
            if (result === 'valid') {
              onSuccess(INVITE_CODE);
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

function goToInviteCodeAndVerify() {
  fireEvent.click(screen.getByTestId('human-selection'));
  fireEvent.click(screen.getByTestId('human-invite-code'));
}

describe('Human template', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockToast.mockClear();
    mockResetOnboarding.mockClear();
    mockSetInviteCode.mockClear();
    mockVerifySignupToken.mockReset();
    mockVerifySignupToken.mockResolvedValue('valid');
  });

  it('renders all main components', () => {
    render(<Human />);

    expect(screen.getByTestId('human-selection')).toBeInTheDocument();
  });

  describe('invite code verification', () => {
    it('shows a success toast and navigates to install when the homeserver returns 200 with status valid', async () => {
      mockVerifySignupToken.mockResolvedValue('valid');
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.INSTALL);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(mockToast).toHaveBeenCalledWith(INVITE_CODE_TOASTS.valid);
      expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
    });

    it('shows a warning toast and stays on the invite step when the homeserver returns 404', async () => {
      mockVerifySignupToken.mockResolvedValue('invalid');
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(INVITE_CODE_TOASTS.invalid);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('human-invite-code')).toBeInTheDocument();
    });

    it('shows a warning toast and stays on the invite step when the homeserver returns 200 with status used', async () => {
      mockVerifySignupToken.mockResolvedValue('used');
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(INVITE_CODE_TOASTS.used);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(mockToast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('human-invite-code')).toBeInTheDocument();
    });

    it('shows an error toast and stays on the invite step when verification cannot reach the homeserver', async () => {
      mockVerifySignupToken.mockRejectedValue(new Error('network error'));
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(INVITE_CODE_TOASTS.verificationFailed);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(mockToast).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('human-invite-code')).toBeInTheDocument();
    });
  });
});

describe('Human template - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Human />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
