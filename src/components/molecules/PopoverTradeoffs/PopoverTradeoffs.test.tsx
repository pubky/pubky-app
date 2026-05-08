import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PopoverTradeoffs } from './PopoverTradeoffs';

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
    Button: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
      <button data-testid={`button-${variant || 'default'}`} className={className}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
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
    }) => (
      <div role="heading" aria-level={level} data-testid={`heading-${level}`} data-size={size} className={className}>
        {children}
      </div>
    ),
  };
});

describe('PopoverTradeoffs', () => {
  it('renders with default props', () => {
    render(<PopoverTradeoffs />);

    const popover = screen.getByTestId('popover');
    const trigger = screen.getByTestId('popover-trigger');
    const content = screen.getByTestId('popover-content');
    const button = screen.getByTestId('button-ghost');

    expect(popover).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(button).toBeInTheDocument();
  });
});

describe('PopoverTradeoffs - Snapshots', () => {
  it('matches snapshot for default PopoverTradeoffs', () => {
    const { container } = render(<PopoverTradeoffs />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
