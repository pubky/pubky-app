import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PopoverBackup } from './PopoverBackup';

// Mock atoms
vi.mock('@/atoms', () => ({
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
  Button: ({
    children,
    variant,
    size,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button data-testid={`button-${variant || 'default'}`} data-size={size} className={className}>
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
  Typography: ({ children, size, className }: { children: React.ReactNode; size?: string; className?: string }) => (
    <p data-testid="typography" data-size={size} className={className}>
      {children}
    </p>
  ),
}));

describe('PopoverBackup - Snapshots', () => {
  it('matches snapshot for default PopoverBackup', () => {
    const { container } = render(<PopoverBackup />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PopoverBackup with custom className', () => {
    const { container } = render(<PopoverBackup className="custom-backup-style" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
