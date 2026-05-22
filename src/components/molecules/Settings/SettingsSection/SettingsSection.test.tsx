import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsSection } from './SettingsSection';

// Mock Atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      id,
      variant,
      size,
      disabled,
      onClick,
    }: {
      children: React.ReactNode;
      id?: string;
      variant?: string;
      size?: string;
      disabled?: boolean;
      onClick?: () => void;
    }) => (
      <button
        data-testid="button"
        id={id}
        data-variant={variant}
        data-size={size}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => (
      <div data-testid="container" className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({
      children,
      level,
      size,
      className,
    }: {
      children: React.ReactNode;
      level: number;
      size: string;
      className?: string;
    }) => (
      <div
        role="heading"
        aria-level={level}
        data-testid="heading"
        data-level={level}
        data-size={size}
        className={className}
      >
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
      <p data-testid="typography" data-size={size} className={className}>
        {children}
      </p>
    ),
  };
});

// Mock icon components
const MockButtonIcon = ({ size }: { size?: number }) => (
  <svg data-testid="mock-button-icon" data-size={size}>
    <title>Mock Button Icon</title>
  </svg>
);

const defaultProps = {
  title: 'Account Settings',
  description: 'Manage your account preferences and security settings.',
  buttonText: 'Edit Account',
  buttonIcon: MockButtonIcon,
  buttonId: 'edit-account-btn',
  buttonOnClick: vi.fn(),
};

describe('SettingsSection', () => {
  it('renders with default props', () => {
    render(<SettingsSection {...defaultProps} />);

    expect(screen.getByTestId('heading')).toHaveTextContent('Account Settings');
    expect(screen.getByTestId('typography')).toHaveTextContent(
      'Manage your account preferences and security settings.',
    );
    expect(screen.getByTestId('button')).toHaveTextContent('Edit Account');
    expect(screen.getByTestId('mock-button-icon')).toBeInTheDocument();
  });

  it('renders button as enabled by default', () => {
    render(<SettingsSection {...defaultProps} />);

    const button = screen.getByTestId('button');
    expect(button).not.toBeDisabled();
  });

  it('renders button as disabled when specified', () => {
    render(<SettingsSection {...defaultProps} buttonDisabled={true} />);

    const button = screen.getByTestId('button');
    expect(button).toBeDisabled();
  });

  it('calls buttonOnClick when button is clicked', () => {
    const handleClick = vi.fn();
    render(<SettingsSection {...defaultProps} buttonOnClick={handleClick} />);

    const button = screen.getByTestId('button');
    fireEvent.click(button);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsSection - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<SettingsSection {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with destructive variant', () => {
    const { container } = render(<SettingsSection {...defaultProps} buttonVariant="destructive" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with disabled button', () => {
    const { container } = render(<SettingsSection {...defaultProps} buttonDisabled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
