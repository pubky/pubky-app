import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogPrivacy } from './DialogPrivacy';

// The Dialog mock predates the keyboard-operable trigger; `dialogMode.real` lets the
// "with the real Dialog" tests render the actual Radix dialog instead.
const dialogMode = vi.hoisted(() => ({ real: false }));

vi.mock('@/atoms/Dialog/Dialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/atoms/Dialog/Dialog')>();
  return {
    Dialog: (props: React.ComponentProps<typeof actual.Dialog>) =>
      dialogMode.real ? <actual.Dialog {...props} /> : <div data-testid="dialog">{props.children}</div>,
    DialogContent: (props: React.ComponentProps<typeof actual.DialogContent>) =>
      dialogMode.real ? (
        <actual.DialogContent {...props} />
      ) : (
        <div data-testid="dialog-content" className={props.className}>
          {props.children}
        </div>
      ),
    DialogHeader: (props: React.ComponentProps<typeof actual.DialogHeader>) =>
      dialogMode.real ? (
        <actual.DialogHeader {...props} />
      ) : (
        <div data-testid="dialog-header" className={props.className}>
          {props.children}
        </div>
      ),
    DialogTitle: (props: React.ComponentProps<typeof actual.DialogTitle>) =>
      dialogMode.real ? <actual.DialogTitle {...props} /> : <h2 data-testid="dialog-title">{props.children}</h2>,
    DialogTrigger: (props: React.ComponentProps<typeof actual.DialogTrigger>) =>
      dialogMode.real ? (
        <actual.DialogTrigger {...props} />
      ) : (
        <div data-testid="dialog-trigger" data-as-child={props.asChild}>
          {props.children}
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

  it('exposes the default trigger as a keyboard focusable button', () => {
    render(<DialogPrivacy />);

    const trigger = screen.getByRole('button', { name: 'Privacy Policy' });
    expect(trigger).toHaveAttribute('tabindex', '0');
  });

  it('renders a custom trigger instead of the default one', () => {
    render(<DialogPrivacy trigger={<button type="button">Custom trigger</button>} />);

    expect(screen.getByRole('button', { name: 'Custom trigger' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Privacy Policy' })).not.toBeInTheDocument();
  });
});

describe('DialogPrivacy with the real Dialog', () => {
  beforeEach(() => {
    dialogMode.real = true;
  });

  afterEach(() => {
    dialogMode.real = false;
  });

  it('opens the dialog when the default trigger is activated with Enter', async () => {
    const user = userEvent.setup();
    render(<DialogPrivacy />);

    const trigger = screen.getByRole('button', { name: 'Privacy Policy' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: 'Privacy Policy' })).toBeInTheDocument();
  });
});

describe('DialogPrivacy - Snapshots', () => {
  it('matches snapshot for default DialogPrivacy', () => {
    const { container } = render(<DialogPrivacy />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
