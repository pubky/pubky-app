import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PopoverPublicKey } from './PopoverPublicKey';

vi.mock('@/atoms/Popover/Popover', () => {
  return {
    Popover: ({ children }: { children: React.ReactNode }) => <div data-testid="popover">{children}</div>,
    PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="popover-trigger" data-as-child={asChild}>
        {children}
      </div>
    ),
    PopoverContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="popover-content" className={className}>
        {children}
      </div>
    ),
  };
});

// Mock atoms and molecules
vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      variant,
      size,
      className,
      onClick,
      ...props
    }: {
      children: React.ReactNode;
      variant?: string;
      size?: string;
      className?: string;
      onClick?: () => void;
      [key: string]: unknown;
    }) => (
      <button
        data-testid="popover-button"
        data-variant={variant}
        data-size={size}
        className={className !== undefined ? className : 'hover:bg-white/10'}
        onClick={onClick}
        {...props}
      >
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={`flex flex-col ${className}`}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({
      children,
      level = 1,
      size,
      className,
    }: {
      children: React.ReactNode;
      level?: number;
      size?: string;
      className?: string;
    }) => {
      const sizeClasses = size === 'sm' ? 'text-lg font-semibold' : '';
      return (
        <div
          role="heading"
          aria-level={level}
          data-testid={`heading-${level}`}
          data-size={size}
          className={`${sizeClasses} text-foreground ${className}`}
        >
          {children}
        </div>
      );
    },
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => {
      const sizeClasses = size === 'sm' ? 'text-lg font-semibold' : '';
      return (
        <p data-testid="typography" data-size={size} className={`${sizeClasses} text-foreground ${className}`}>
          {children}
        </p>
      );
    },
  };
});

describe('PopoverPublicKey', () => {
  it('renders with default props', () => {
    render(<PopoverPublicKey />);

    const popover = screen.getByTestId('popover');
    const trigger = screen.getByTestId('popover-trigger');
    const button = screen.getByTestId('popover-button');
    const content = screen.getByTestId('popover-content');

    expect(popover).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(button).toBeInTheDocument();
    expect(content).toBeInTheDocument();
  });

  it('can be clicked to potentially open popover', () => {
    // We'll simulate a click on the button
    render(<PopoverPublicKey />);

    const button = screen.getByTestId('popover-button');
    fireEvent.click(button);

    // The button should be clickable (no errors thrown)
    expect(button).toBeInTheDocument();
  });
});

describe('PopoverPublicKey - Snapshots', () => {
  it('matches snapshot for default PopoverPublicKey', () => {
    const { container } = render(<PopoverPublicKey />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PopoverPublicKey with custom className', () => {
    const { container } = render(<PopoverPublicKey className="custom-public-key-style" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
