import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DialogAge } from './DialogAge';

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

describe('DialogAge', () => {
  it('renders with default props', () => {
    render(<DialogAge />);

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

  it('renders age requirement content', () => {
    render(<DialogAge />);

    const title = screen.getByTestId('dialog-title');
    expect(title).toHaveTextContent('Age minimum: 18');
    expect(screen.getByText(/You can only use Pubky if you are over 18 years old/)).toBeInTheDocument();
  });

  it('exposes the default trigger as a keyboard focusable button', () => {
    render(<DialogAge />);

    const trigger = screen.getByRole('button', { name: 'over 18 years old.' });
    expect(trigger).toHaveAttribute('tabindex', '0');
  });
});

describe('DialogAge with the real Dialog', () => {
  beforeEach(() => {
    dialogMode.real = true;
  });

  afterEach(() => {
    dialogMode.real = false;
  });

  it('opens the dialog when the default trigger is activated with Enter', async () => {
    const user = userEvent.setup();
    render(<DialogAge />);

    const trigger = screen.getByRole('button', { name: 'over 18 years old.' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    trigger.focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog', { name: 'Age minimum: 18' })).toBeInTheDocument();
  });
});
