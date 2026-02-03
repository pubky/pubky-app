import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { HumanInviteCode } from './HumanInviteCode';

vi.mock('@/molecules', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/molecules');

  return {
    ...actual,
    HumanFooter: () => <div data-testid="mock-human-footer">Human Footer</div>,
  };
});

describe('HumanInviteCode', () => {
  // Sanity test
  it('renders with default props', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    expect(screen.getByTestId('human-invite-code-card')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('XXXX-XXXX-XXXX')).toBeInTheDocument();
  });

  // Functional tests
  it('calls onBack when back button is clicked', () => {
    const handleBack = vi.fn();
    render(<HumanInviteCode onBack={handleBack} onSuccess={() => {}} />);
    fireEvent.click(screen.getByText('Back'));
    expect(handleBack).toHaveBeenCalledTimes(1);
  });

  it('formats input with automatic dashes after 4th and 8th characters', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
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
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });
    expect(input).toHaveValue('N76Q-G32N-C0RG');
  });

  it('converts input to uppercase', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'abcd' } });
    expect(input).toHaveValue('ABCD');
  });

  it('strips non-alphanumeric characters from input', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'A!@#B$%^C&*(D' } });
    expect(input).toHaveValue('ABCD');
  });

  it('handles pasted code with existing dashes', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'N76Q-G32N-C0RG' } });
    expect(input).toHaveValue('N76Q-G32N-C0RG');
  });

  it('limits input to 12 alphanumeric characters (14 with dashes)', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    fireEvent.change(input, { target: { value: 'N76QG32NC0RGEXTRA' } });
    expect(input).toHaveValue('N76Q-G32N-C0RG');
  });

  it('disables continue button when code is incomplete', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const continueButton = screen.getByText('Continue').closest('button');
    expect(continueButton).toBeDisabled();

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76Q' } });
    expect(continueButton).toBeDisabled();
  });

  it('enables continue button when code is complete', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });

    const continueButton = screen.getByText('Continue').closest('button');
    expect(continueButton).not.toBeDisabled();
  });

  it('calls onSuccess with trimmed code when continue is clicked', () => {
    const handleSuccess = vi.fn();
    render(<HumanInviteCode onBack={() => {}} onSuccess={handleSuccess} />);

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });

    fireEvent.click(screen.getByText('Continue'));
    expect(handleSuccess).toHaveBeenCalledWith('N76Q-G32N-C0RG');
  });

  it('disables continue button after clicking to prevent double submission', () => {
    const handleSuccess = vi.fn();
    render(<HumanInviteCode onBack={() => {}} onSuccess={handleSuccess} />);

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });

    const continueButton = screen.getByText('Continue').closest('button');
    fireEvent.click(continueButton!);

    expect(continueButton).toBeDisabled();
    expect(handleSuccess).toHaveBeenCalledTimes(1);
  });

  it('submits on Enter key when code is complete', () => {
    const handleSuccess = vi.fn();
    render(<HumanInviteCode onBack={() => {}} onSuccess={handleSuccess} />);

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSuccess).toHaveBeenCalledWith('N76Q-G32N-C0RG');
  });

  it('does not submit on Enter key when code is incomplete', () => {
    const handleSuccess = vi.fn();
    render(<HumanInviteCode onBack={() => {}} onSuccess={handleSuccess} />);

    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76Q' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleSuccess).not.toHaveBeenCalled();
  });

  it('shows check icon when code is complete', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    // Icon should not be visible initially
    expect(
      screen.queryByTestId('human-invite-code-card')?.querySelector('.lucide-circle-check'),
    ).not.toBeInTheDocument();

    // Complete the code
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });

    // Icon should now be visible
    expect(screen.getByTestId('human-invite-code-card').querySelector('.lucide-circle-check')).toBeInTheDocument();
  });

  it('applies brand styling to input when code is complete', () => {
    render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');

    // Initially should have foreground text color
    expect(input).toHaveClass('text-foreground');
    expect(input).not.toHaveClass('text-brand');

    // Complete the code
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });

    // Should now have brand text color and bold font
    expect(input).toHaveClass('text-brand');
    expect(input).toHaveClass('font-bold');
  });
});

describe('HumanInviteCode - Snapshots', () => {
  it('matches snapshot for empty state', () => {
    const { container } = render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for complete code state', () => {
    const { container } = render(<HumanInviteCode onBack={() => {}} onSuccess={() => {}} />);
    const input = screen.getByPlaceholderText('XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'N76QG32NC0RG' } });
    expect(container).toMatchSnapshot();
  });
});
