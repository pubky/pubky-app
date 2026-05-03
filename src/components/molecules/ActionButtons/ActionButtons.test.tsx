import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActionButtons } from './ActionButtons';

describe('ActionButtons', () => {
  it('renders both buttons with default text', () => {
    render(<ActionButtons />);

    const signInButton = screen.getByRole('button', { name: /sign in/i });
    const createAccountButton = screen.getByRole('button', { name: /create account/i });

    expect(signInButton).toBeInTheDocument();
    expect(createAccountButton).toBeInTheDocument();

    // Check icons are present
    expect(document.querySelector('.lucide-log-in')).toBeInTheDocument();
    expect(document.querySelector('.lucide-user-round-plus')).toBeInTheDocument();
  });

  it('calls onSignIn when sign in button is clicked', () => {
    const mockOnSignIn = vi.fn();
    render(<ActionButtons onSignIn={mockOnSignIn} />);

    const signInButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(signInButton);

    expect(mockOnSignIn).toHaveBeenCalledTimes(1);
  });

  it('calls onCreateAccount when create account button is clicked', () => {
    const mockOnCreateAccount = vi.fn();
    render(<ActionButtons onCreateAccount={mockOnCreateAccount} />);

    const createAccountButton = screen.getByRole('button', { name: /create account/i });
    fireEvent.click(createAccountButton);

    expect(mockOnCreateAccount).toHaveBeenCalledTimes(1);
  });

  it('handles both callbacks simultaneously', () => {
    const mockOnSignIn = vi.fn();
    const mockOnCreateAccount = vi.fn();

    render(<ActionButtons onSignIn={mockOnSignIn} onCreateAccount={mockOnCreateAccount} />);

    const signInButton = screen.getByRole('button', { name: /sign in/i });
    const createAccountButton = screen.getByRole('button', { name: /create account/i });

    fireEvent.click(signInButton);
    fireEvent.click(createAccountButton);

    expect(mockOnSignIn).toHaveBeenCalledTimes(1);
    expect(mockOnCreateAccount).toHaveBeenCalledTimes(1);
  });
});

describe('ActionButtons - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ActionButtons />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom text', () => {
    const { container } = render(<ActionButtons signInText="Log In" createAccountText="Register" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<ActionButtons className="custom-action-buttons" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with both callbacks', () => {
    const mockOnSignIn = vi.fn();
    const mockOnCreateAccount = vi.fn();

    const { container } = render(<ActionButtons onSignIn={mockOnSignIn} onCreateAccount={mockOnCreateAccount} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with sign in callback only', () => {
    const mockOnSignIn = vi.fn();

    const { container } = render(<ActionButtons onSignIn={mockOnSignIn} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with create account callback only', () => {
    const mockOnCreateAccount = vi.fn();

    const { container } = render(<ActionButtons onCreateAccount={mockOnCreateAccount} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
