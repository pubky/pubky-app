import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogPrivacy } from './DialogPrivacy';

vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>,
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-content" className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-header" className={className}>
        {children}
      </div>
    ),
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
    DialogTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
      <div data-testid="dialog-trigger" data-as-child={asChild}>
        {children}
      </div>
    ),
  };
});

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
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

vi.mock('@/atoms/List/List', () => {
  return {
    List: ({
      children,
      as: Tag = 'ul',
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
    }) => (
      <Tag data-testid="list" className={className}>
        {children}
      </Tag>
    ),
  };
});

vi.mock('@/atoms/SidebarButton/SidebarButton', () => {
  return {
    SidebarButton: ({
      children,
      icon: Icon,
    }: {
      children: React.ReactNode;
      icon: React.ComponentType<{ className?: string }>;
    }) => (
      <button data-testid="sidebar-button">
        <Icon data-testid="sidebar-button-icon" />
        <span data-testid="sidebar-button-text">{children}</span>
      </button>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      as: Tag = 'p',
      className,
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
    }) => (
      <Tag data-testid="typography" className={className}>
        {children}
      </Tag>
    ),
  };
});

describe('DialogPrivacy', () => {
  it('renders with default props', () => {
    render(<DialogPrivacy />);

    const dialog = screen.getByTestId('dialog');
    const trigger = screen.getByTestId('dialog-trigger');
    const content = screen.getByTestId('dialog-content');
    const header = screen.getByTestId('dialog-header');
    const title = screen.getByTestId('dialog-title');

    expect(dialog).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(content).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(title).toBeInTheDocument();
  });

  it('renders privacy policy content', () => {
    render(<DialogPrivacy />);

    // Check for some key privacy policy content
    expect(screen.getByText(/SCOPE This Privacy Policy/)).toBeInTheDocument();
    expect(screen.getByText(/POLICY SUMMARY This summary offers/)).toBeInTheDocument();
    expect(screen.getByText(/Effective Date: January 29, 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Synonym Software Ltd/).length).toBeGreaterThan(0);
  });
});

describe('DialogPrivacy - Snapshots', () => {
  it('matches snapshot for default DialogPrivacy', () => {
    const { container } = render(<DialogPrivacy />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
