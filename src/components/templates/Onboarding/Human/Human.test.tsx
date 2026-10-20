import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ONBOARDING_ROUTES } from '@/app/routes';
import { toast } from '@/molecules/Toaster/toast';
import { Human } from './Human';

const mockPush = vi.fn();
const mockResetOnboarding = vi.fn();
const mockSetInviteCode = vi.fn();
const mockVerifySignupToken = vi.fn<(inviteCode: string) => Promise<'valid' | 'used' | 'invalid'>>();

const INVITE_CODE = 'YVB2-YFRN-GDY0';

const INVITE_CODE_TOASTS = {
  invalid: {
    title: 'Invalid invite code',
    variant: 'error',
  },
  used: {
    title: 'Invite code already used',
    variant: 'error',
  },
  verificationFailed: {
    variant: 'error',
    title: "Couldn't verify invite code",
  },
} as const;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/molecules/Toaster/toast');

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
  fireEvent.change(screen.getByRole('textbox', { name: 'Invite code' }), { target: { value: INVITE_CODE } });
}

describe('Human template', () => {
  beforeEach(() => {
    mockPush.mockClear();
    vi.mocked(toast).mockReset();
    vi.mocked(toast).mockReturnValue({ dismiss: vi.fn() });
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
    it('confirms a valid invite inline and waits for Continue before navigating to install', async () => {
      mockVerifySignupToken.mockResolvedValue('valid');
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent('Invite code applied');
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(vi.mocked(toast)).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockSetInviteCode).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(mockSetInviteCode).toHaveBeenCalledWith(INVITE_CODE);
      expect(mockPush).toHaveBeenCalledWith(ONBOARDING_ROUTES.INSTALL);
    });

    it.each(['invalid', 'used', 'error'] as const)(
      'dismisses its previous %s toast when a new verification starts',
      async (outcome) => {
        if (outcome === 'error') {
          mockVerifySignupToken.mockRejectedValueOnce(new Error('network error'));
        } else {
          mockVerifySignupToken.mockResolvedValueOnce(outcome);
        }
        const dismissVerification = vi.fn();
        vi.mocked(toast).mockReturnValueOnce({ dismiss: dismissVerification });
        render(<Human />);

        goToInviteCodeAndVerify();
        await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));

        const dismissUnrelated = vi.fn();
        vi.mocked(toast).mockReturnValueOnce({ dismiss: dismissUnrelated });
        toast({ title: 'Update available', persistent: true });

        fireEvent.change(screen.getByRole('textbox', { name: 'Invite code' }), {
          target: { value: 'AAAA-BBBB-CCCC' },
        });

        expect(dismissVerification).toHaveBeenCalledTimes(1);
        expect(dismissUnrelated).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Invite code applied'));
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
        expect(toast).toHaveBeenCalledTimes(2);
      },
    );

    it('preserves the current error when an older verification succeeds after it', async () => {
      const olderVerification = Promise.withResolvers<'valid'>();
      mockVerifySignupToken.mockReturnValueOnce(olderVerification.promise).mockResolvedValueOnce('invalid');
      const dismissCurrentError = vi.fn();
      vi.mocked(toast).mockReturnValueOnce({ dismiss: dismissCurrentError });
      render(<Human />);

      goToInviteCodeAndVerify();
      fireEvent.change(screen.getByRole('textbox', { name: 'Invite code' }), {
        target: { value: 'AAAA-BBBB-CCCC' },
      });
      await waitFor(() => expect(toast).toHaveBeenCalledWith(INVITE_CODE_TOASTS.invalid));
      expect(mockVerifySignupToken).toHaveBeenNthCalledWith(1, INVITE_CODE);
      expect(mockVerifySignupToken).toHaveBeenNthCalledWith(2, 'AAAA-BBBB-CCCC');

      await act(async () => olderVerification.resolve('valid'));

      expect(dismissCurrentError).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('status')).toBeEmptyDOMElement();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockSetInviteCode).not.toHaveBeenCalled();
    });

    it.each(['invalid', 'used', 'error'] as const)(
      'does not leave an older %s toast over a newer successful verification',
      async (outcome) => {
        const olderVerification = Promise.withResolvers<'invalid' | 'used'>();
        const currentVerification = Promise.withResolvers<'valid'>();
        mockVerifySignupToken
          .mockReturnValueOnce(olderVerification.promise)
          .mockReturnValueOnce(currentVerification.promise);
        render(<Human />);

        goToInviteCodeAndVerify();
        fireEvent.change(screen.getByRole('textbox', { name: 'Invite code' }), {
          target: { value: 'AAAA-BBBB-CCCC' },
        });

        await act(async () => {
          if (outcome === 'error') {
            olderVerification.reject(new Error('network error'));
          } else {
            olderVerification.resolve(outcome);
          }
        });
        await act(async () => currentVerification.resolve('valid'));

        expect(toast).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toHaveTextContent('Invite code applied');
        expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
      },
    );

    it('shows an error toast and stays on the invite step when the homeserver returns 404', async () => {
      mockVerifySignupToken.mockResolvedValue('invalid');
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalledWith(INVITE_CODE_TOASTS.invalid);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Invite code' })).toBeInTheDocument();
    });

    it('shows an error toast and stays on the invite step when the homeserver returns 200 with status used', async () => {
      mockVerifySignupToken.mockResolvedValue('used');
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalledWith(INVITE_CODE_TOASTS.used);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(vi.mocked(toast)).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Invite code' })).toBeInTheDocument();
    });

    it('shows an error toast and stays on the invite step when verification cannot reach the homeserver', async () => {
      mockVerifySignupToken.mockRejectedValue(new Error('network error'));
      render(<Human />);

      goToInviteCodeAndVerify();

      await waitFor(() => {
        expect(vi.mocked(toast)).toHaveBeenCalledWith(INVITE_CODE_TOASTS.verificationFailed);
      });
      expect(mockVerifySignupToken).toHaveBeenCalledWith(INVITE_CODE);
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Invite code' })).toBeInTheDocument();
    });
  });
});
