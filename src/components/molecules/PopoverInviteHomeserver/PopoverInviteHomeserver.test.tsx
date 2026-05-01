import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PopoverInviteHomeserver } from './PopoverInviteHomeserver';
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

// Mock atoms
vi.mock('@/atoms/Button/Button', () => {
  return {
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

vi.mock('@/atoms/Link/Link', () => {
  return {
    Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
      <a data-testid="link" href={href} className={className}>
        {children}
      </a>
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

describe('PopoverInviteHomeserver - Snapshots', () => {
  it('matches snapshot for default PopoverInviteHomeserver', () => {
    const { container } = render(<PopoverInviteHomeserver />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for PopoverInviteHomeserver with custom className', () => {
    const { container } = render(<PopoverInviteHomeserver className="custom-homeserver-style" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
