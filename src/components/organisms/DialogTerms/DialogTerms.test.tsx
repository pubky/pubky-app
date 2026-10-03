import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogTerms } from './DialogTerms';

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
      size: _size,
      ...props
    }: {
      children: React.ReactNode;
      as?: React.ElementType;
      className?: string;
      size?: string;
    } & React.HTMLAttributes<HTMLElement>) => (
      <Tag data-testid="typography" className={className} {...props}>
        {children}
      </Tag>
    ),
  };
});

describe('DialogTerms', () => {
  it('renders with default props', () => {
    render(<DialogTerms />);

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

  it('renders terms of service content', () => {
    render(<DialogTerms />);

    // Check for some key terms content - use getAllByText for elements that appear multiple times
    expect(screen.getByText(/Thank you for using the Pubky platform/)).toBeInTheDocument();
    expect(screen.getAllByText(/TERMS AND CONDITIONS/)).toHaveLength(2); // Appears twice
    expect(screen.getByText(/Effective Date: January 29, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/PLEASE REVIEW THE ARBITRATION PROVISION/)).toBeInTheDocument();
  });

  it('exposes the default trigger as a keyboard focusable button', () => {
    render(<DialogTerms />);

    const trigger = screen.getByRole('button', { name: 'Terms of Service' });
    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it.each(['Enter', ' '])('activates the default trigger on the "%s" key', (key) => {
    render(<DialogTerms />);

    const trigger = screen.getByRole('button', { name: 'Terms of Service' });
    const handleClick = vi.fn();
    trigger.addEventListener('click', handleClick);
    fireEvent.keyDown(trigger, { key });

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys on the default trigger', () => {
    render(<DialogTerms />);

    const trigger = screen.getByRole('button', { name: 'Terms of Service' });
    const handleClick = vi.fn();
    trigger.addEventListener('click', handleClick);
    fireEvent.keyDown(trigger, { key: 'a' });

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('renders a custom trigger instead of the default one', () => {
    render(<DialogTerms trigger={<button type="button">Custom trigger</button>} />);

    expect(screen.getByRole('button', { name: 'Custom trigger' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terms of Service' })).not.toBeInTheDocument();
  });
});

describe('DialogTerms - Snapshots', () => {
  it('matches snapshot for default DialogTerms', () => {
    const { container } = render(<DialogTerms />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
