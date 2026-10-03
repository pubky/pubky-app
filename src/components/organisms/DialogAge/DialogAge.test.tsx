import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DialogAge } from './DialogAge';

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

  it.each(['Enter', ' '])('activates the default trigger on the "%s" key', (key) => {
    render(<DialogAge />);

    const trigger = screen.getByRole('button', { name: 'over 18 years old.' });
    const handleClick = vi.fn();
    trigger.addEventListener('click', handleClick);
    fireEvent.keyDown(trigger, { key });

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys on the default trigger', () => {
    render(<DialogAge />);

    const trigger = screen.getByRole('button', { name: 'over 18 years old.' });
    const handleClick = vi.fn();
    trigger.addEventListener('click', handleClick);
    fireEvent.keyDown(trigger, { key: 'a' });

    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe('DialogAge - Snapshots', () => {
  it('matches snapshot for default DialogAge', () => {
    const { container } = render(<DialogAge />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
