import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HumanInviteCode } from './HumanInviteCode';
import type { InviteCodeVerificationResult } from './HumanInviteCode.types';

vi.mock('@/molecules/HumanFooter/HumanFooter', () => {
  return {
    HumanFooter: () => <div data-testid="mock-human-footer">Human Footer</div>,
  };
});

const COMPLETE_INVITE_CODE = 'N76QG32NC0RG';
const FORMATTED_INVITE_CODE = 'N76Q-G32N-C0RG';

function renderHumanInviteCode({
  onBack = () => {},
  onVerify = vi.fn().mockResolvedValue('valid' satisfies InviteCodeVerificationResult),
  onSuccess = () => {},
}: {
  onBack?: () => void;
  onVerify?: (inviteCode: string) => Promise<InviteCodeVerificationResult>;
  onSuccess?: (inviteCode: string) => void;
} = {}) {
  return render(<HumanInviteCode onBack={onBack} onVerify={onVerify} onSuccess={onSuccess} />);
}

async function enterCompleteInviteCode() {
  const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
  fireEvent.change(input, { target: { value: COMPLETE_INVITE_CODE } });
  return input;
}

describe('HumanInviteCode', () => {
  // Sanity test
  it('renders with default props', () => {
    renderHumanInviteCode();
    expect(screen.getByTestId('human-invite-code-card')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('XXXX-XXXX-XXXX')).toBeInTheDocument();
  });

  it('renders the Figma copy while keeping the invite helper', () => {
    renderHumanInviteCode();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Use Invite.');
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Phone or payment verification not available? Ask us for an invite code.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Enter invite code' })).toBeInTheDocument();
    expect(screen.getByTestId('circle-help-icon')).toBeInTheDocument();
  });

  // Functional tests
  it('calls onBack when back button is clicked', () => {
    const handleBack = vi.fn();
    renderHumanInviteCode({ onBack: handleBack });
    fireEvent.click(screen.getByText('Back'));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('formats input with automatic dashes after 4th and 8th characters', () => {
    renderHumanInviteCode();
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    // Type first 4 characters
    fireEvent.change(input, { target: { value: 'N76Q' } });
    expect(input).toHaveValue('N76Q');

    // Type 5th character - should add dash
    fireEvent.change(input, { target: { value: 'N76QG' } });
    expect(input).toHaveValue('N76Q-G');

    // Type up to 8th character
    fireEvent.change(input, { target: { value: 'N76QG32N' } });
    expect(input).toHaveValue('N76Q-G32N');

    // Type 9th character - should add second dash
    fireEvent.change(input, { target: { value: 'N76QG32NC' } });
    expect(input).toHaveValue('N76Q-G32N-C');

    // Complete code
    fireEvent.change(input, { target: { value: COMPLETE_INVITE_CODE } });
    expect(input).toHaveValue(FORMATTED_INVITE_CODE);
  });

  it('converts input to uppercase', () => {
    renderHumanInviteCode();
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'abcd' } });
    expect(input).toHaveValue('ABCD');
  });

  it('strips non-alphanumeric characters from input', () => {
    renderHumanInviteCode();
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'A!@#B$%^C&*(D' } });
    expect(input).toHaveValue('ABCD');
  });

  it('handles pasted code with existing dashes', () => {
    renderHumanInviteCode();
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: FORMATTED_INVITE_CODE } });
    expect(input).toHaveValue(FORMATTED_INVITE_CODE);
  });

  it('limits input to 12 alphanumeric characters (14 with dashes)', () => {
    renderHumanInviteCode();
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'N76QG32NC0RGEXTRA' } });
    expect(input).toHaveValue(FORMATTED_INVITE_CODE);
  });

  it('disables continue button when code is incomplete', () => {
    renderHumanInviteCode();
    const continueButton = screen.getByText('Continue').closest('button');
    expect(continueButton).toBeDisabled();

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76Q' } });
    expect(continueButton).toBeDisabled();
  });

  it('verifies automatically when the full code is entered', async () => {
    const handleVerify = vi.fn().mockResolvedValue('valid');
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledWith(FORMATTED_INVITE_CODE);
    });
  });

  it('verifies when the 12th alphanumeric character is typed one character at a time', async () => {
    const handleVerify = vi.fn().mockResolvedValue('valid');
    renderHumanInviteCode({ onVerify: handleVerify });

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    let typed = '';
    for (const char of COMPLETE_INVITE_CODE) {
      typed += char;
      fireEvent.change(input, { target: { value: typed } });
    }

    expect(input).toHaveValue(FORMATTED_INVITE_CODE);

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledWith(FORMATTED_INVITE_CODE);
    });
    expect(handleVerify).toHaveBeenCalledTimes(1);
  });

  it('enables continue button only after verification succeeds', async () => {
    const handleVerify = vi.fn().mockResolvedValue('valid');
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    const continueButton = screen.getByText('Continue').closest('button');
    expect(continueButton).toBeDisabled();

    await waitFor(() => {
      expect(continueButton).not.toBeDisabled();
    });
  });

  it('keeps continue button disabled when verification fails', async () => {
    const handleVerify = vi.fn().mockResolvedValue('invalid');
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledWith(FORMATTED_INVITE_CODE);
    });

    const continueButton = screen.getByText('Continue').closest('button');
    expect(continueButton).toBeDisabled();
  });

  it('applies destructive border styling when the invite code is not recognised', async () => {
    const handleVerify = vi.fn().mockResolvedValue('invalid');
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    await waitFor(() => {
      expect(screen.getByTestId('human-invite-code-input-field')).toHaveClass('border-destructive');
    });
    expect(screen.getByTestId('human-invite-code-input-field')).not.toHaveClass('border-brand');
  });

  it('applies destructive border styling when the invite code has already been used', async () => {
    const handleVerify = vi.fn().mockResolvedValue('used');
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    await waitFor(() => {
      expect(screen.getByTestId('human-invite-code-input-field')).toHaveClass('border-destructive');
    });
    expect(screen.getByTestId('human-invite-code-input-field')).not.toHaveClass('border-brand');
  });

  it('keeps neutral border styling when verification cannot reach the homeserver', async () => {
    const handleVerify = vi.fn().mockResolvedValue('error');
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledWith(FORMATTED_INVITE_CODE);
    });

    const inputField = screen.getByTestId('human-invite-code-input-field');
    expect(inputField).toHaveClass('border-input');
    expect(inputField).not.toHaveClass('border-destructive');
    expect(inputField).not.toHaveClass('border-brand');
  });

  it('calls onSuccess with trimmed code when continue is clicked after verification', async () => {
    const handleSuccess = vi.fn();
    renderHumanInviteCode({ onSuccess: handleSuccess });

    await enterCompleteInviteCode();

    const continueButton = screen.getByText('Continue').closest('button');
    await waitFor(() => {
      expect(continueButton).not.toBeDisabled();
    });

    fireEvent.click(continueButton!);
    expect(handleSuccess).toHaveBeenCalledWith(FORMATTED_INVITE_CODE);
  });

  it('submits on Enter key after verification succeeds', async () => {
    const handleSuccess = vi.fn();
    renderHumanInviteCode({ onSuccess: handleSuccess });

    const input = await enterCompleteInviteCode();

    await waitFor(() => {
      expect(screen.getByText('Continue').closest('button')).not.toBeDisabled();
    });

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(handleSuccess).toHaveBeenCalledWith(FORMATTED_INVITE_CODE);
  });

  it('does not submit on Enter key when code is incomplete', () => {
    const handleSuccess = vi.fn();
    renderHumanInviteCode({ onSuccess: handleSuccess });

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76Q' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSuccess).not.toHaveBeenCalled();
  });

  it('does not submit on Enter key before verification completes', async () => {
    let resolveVerify: (value: InviteCodeVerificationResult) => void = () => {};
    const handleVerify = vi.fn(
      () =>
        new Promise<InviteCodeVerificationResult>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    const handleSuccess = vi.fn();
    renderHumanInviteCode({ onVerify: handleVerify, onSuccess: handleSuccess });

    const input = await enterCompleteInviteCode();
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSuccess).not.toHaveBeenCalled();

    resolveVerify('valid');

    await waitFor(() => {
      expect(screen.getByText('Continue').closest('button')).not.toBeDisabled();
    });
  });

  it('shows check icon only after verification succeeds', async () => {
    renderHumanInviteCode();

    // Icon should not be visible initially
    expect(
      screen.queryByTestId('human-invite-code-card')?.querySelector('.lucide-circle-check'),
    ).not.toBeInTheDocument();

    await enterCompleteInviteCode();

    await waitFor(() => {
      expect(screen.getByTestId('human-invite-code-card').querySelector('.lucide-circle-check')).toBeInTheDocument();
    });
  });

  it('shows a spinner while verification is in progress', async () => {
    let resolveVerify: (value: InviteCodeVerificationResult) => void = () => {};
    const handleVerify = vi.fn(
      () =>
        new Promise<InviteCodeVerificationResult>((resolve) => {
          resolveVerify = resolve;
        }),
    );
    renderHumanInviteCode({ onVerify: handleVerify });

    await enterCompleteInviteCode();

    const inputField = screen.getByTestId('human-invite-code-input-field');
    expect(screen.getByTestId('human-invite-code-card').querySelector('.lucide-loader-circle')).toBeInTheDocument();
    expect(inputField).toHaveClass('border-input');
    expect(inputField).not.toHaveClass('border-brand');

    resolveVerify('valid');

    await waitFor(() => {
      expect(
        screen.getByTestId('human-invite-code-card').querySelector('.lucide-loader-circle'),
      ).not.toBeInTheDocument();
      expect(inputField).toHaveClass('border-brand');
    });
  });

  it('re-verifies when the invite code is edited after a failed verification', async () => {
    const handleVerify = vi.fn().mockResolvedValueOnce('invalid').mockResolvedValueOnce('valid');
    renderHumanInviteCode({ onVerify: handleVerify });

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: COMPLETE_INVITE_CODE } });

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(input, { target: { value: 'N76QG32NC0RH' } });

    await waitFor(() => {
      expect(handleVerify).toHaveBeenCalledTimes(2);
    });
  });

  it('applies brand styling only after verification succeeds', async () => {
    renderHumanInviteCode();
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    // Initially should have foreground text color
    expect(input).toHaveClass('text-foreground');
    expect(input).not.toHaveClass('text-brand');

    await enterCompleteInviteCode();

    // Full code entered but still verifying — styling stays neutral
    expect(input).toHaveClass('text-foreground');
    expect(input).not.toHaveClass('text-brand');

    await waitFor(() => {
      expect(input).toHaveClass('text-brand');
      expect(input).toHaveClass('font-bold');
    });
  });
});

describe('HumanInviteCode - Snapshots', () => {
  it('matches snapshot for empty state', () => {
    const { container } = renderHumanInviteCode();
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for complete code state', async () => {
    const { container } = renderHumanInviteCode();
    await enterCompleteInviteCode();
    await waitFor(() => {
      expect(screen.getByTestId('human-invite-code-card').querySelector('.lucide-circle-check')).toBeInTheDocument();
    });
    expect(container).toMatchSnapshot();
  });
});
