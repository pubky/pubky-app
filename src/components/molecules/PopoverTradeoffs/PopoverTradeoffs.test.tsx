import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PopoverTradeoffs } from '@/molecules';

// Mock atoms and molecules
vi.mock('@/atoms', () => ({
  Button: ({ children, variant, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <button data-testid={`button-${variant || 'default'}`} className={className}>
      {children}
    </button>
  ),
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
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
}));

vi.mock('@/components/molecules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/molecules')>();
  return {
    ...actual,
    Popover: ({ children }: { children: React.ReactNode }) => <div data-testid="popover">{children}</div>,
    PopoverContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="popover-content" className={className}>
        {children}
      </div>
    ),
    PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="popover-trigger" data-as-child={asChild}>
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
