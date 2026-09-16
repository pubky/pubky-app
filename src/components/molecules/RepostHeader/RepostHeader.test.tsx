import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RepostHeader } from './RepostHeader';

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      overrideDefaults,
      ['data-testid']: dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId ?? 'container'} className={className} data-override-defaults={overrideDefaults}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({
      children,
      className,
      ['data-testid']: dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      'data-testid'?: string;
    }) => (
      <span data-testid={dataTestId ?? 'typography'} className={className}>
        {children}
      </span>
    ),
  };
});

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', () => {
  return {
    PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string; indexedAt?: Date | null }) => (
      <span data-testid="post-header-timestamp">{timeAgo}</span>
    ),
  };
});

describe('RepostHeader', () => {
  it('renders text and icon', () => {
    render(<RepostHeader onUndo={vi.fn()} />);

    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByText('You reposted')).toBeInTheDocument();
  });

  it('renders the undo button', () => {
    render(<RepostHeader onUndo={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('data-cy', 'repost-undo-btn');
  });

  it('says "You shared this" for collection shares', () => {
    render(<RepostHeader isCollectionShare onUndo={vi.fn()} />);

    expect(screen.getByText('You shared this')).toBeInTheDocument();
    expect(screen.queryByText('You reposted')).not.toBeInTheDocument();
  });

  it('calls onUndo when the undo button is clicked', () => {
    const onUndo = vi.fn();
    render(<RepostHeader onUndo={onUndo} />);

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('stops undo interactions from bubbling to the post card', () => {
    const onUndo = vi.fn();
    const onCardClick = vi.fn();
    const onCardAuxClick = vi.fn();
    render(
      <div onClick={onCardClick} onAuxClick={onCardAuxClick}>
        <RepostHeader onUndo={onUndo} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Undo' });

    fireEvent.click(button);
    fireEvent(button, new MouseEvent('auxclick', { bubbles: true, button: 1 }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onCardAuxClick).not.toHaveBeenCalled();
  });

  it('disables the undo button while undoing', () => {
    render(<RepostHeader onUndo={vi.fn()} isUndoing />);
    const button = screen.getByRole('button', { name: 'Undo' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the share time when timeAgo is provided', () => {
    render(<RepostHeader onUndo={vi.fn()} timeAgo="12m" indexedAt={new Date(0)} />);

    expect(screen.getByTestId('post-header-timestamp')).toHaveTextContent('12m');
  });

  it('hides the timestamp when timeAgo is not provided', () => {
    render(<RepostHeader onUndo={vi.fn()} />);

    expect(screen.queryByTestId('post-header-timestamp')).not.toBeInTheDocument();
  });
});

describe('RepostHeader - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<RepostHeader onUndo={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for collection share', () => {
    const { container } = render(<RepostHeader isCollectionShare onUndo={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot while undoing', () => {
    const { container } = render(<RepostHeader onUndo={vi.fn()} isUndoing />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with timestamp', () => {
    const { container } = render(<RepostHeader onUndo={vi.fn()} timeAgo="12m" indexedAt={new Date(0)} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
