import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PostUnavailable } from './PostUnavailable';

vi.mock('@/atoms/Card/Card', () => {
  return {
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" className={className}>
        {children}
      </div>
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

describe('PostUnavailable', () => {
  it('renders the provided message', () => {
    render(<PostUnavailable message="Post not found." />);
    expect(screen.getByText('Post not found.')).toBeInTheDocument();
  });

  it('renders CardContent wrapper with layout classes', () => {
    render(<PostUnavailable message="Deleted." />);
    const cardContent = screen.getByTestId('card-content');
    expect(cardContent).toHaveClass('py-2');
    expect(cardContent).toHaveClass('flex-col');
    expect(cardContent).toHaveClass('gap-3');
  });

  it('renders Typography with correct size and styling', () => {
    render(<PostUnavailable message="Deleted." />);
    const typography = screen.getByTestId('typography');
    expect(typography).toHaveAttribute('data-size', 'sm');
    expect(typography).toHaveClass('text-center');
    expect(typography).toHaveClass('font-normal');
    expect(typography).toHaveClass('text-muted-foreground');
  });

  it('does not render the remove button by default', () => {
    render(<PostUnavailable message="Post not found." />);
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('renders the remove button and handles clicks', () => {
    const onRemove = vi.fn();
    render(<PostUnavailable message="Post not found." onRemove={onRemove} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('uses the default remove data-cy when none is provided', () => {
    render(<PostUnavailable message="Post not found." onRemove={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveAttribute('data-cy', 'post-unavailable-remove-btn');
  });

  it('uses a custom remove data-cy when provided', () => {
    render(<PostUnavailable message="Deleted." onRemove={vi.fn()} removeDataCy="post-deleted-remove-btn" />);
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveAttribute('data-cy', 'post-deleted-remove-btn');
  });

  it('stops remove interactions from bubbling to the post card', () => {
    const onRemove = vi.fn();
    const onCardClick = vi.fn();
    const onCardAuxClick = vi.fn();
    render(
      <div onClick={onCardClick} onAuxClick={onCardAuxClick}>
        <PostUnavailable message="Deleted." onRemove={onRemove} />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Remove' });

    fireEvent.click(button);
    fireEvent(button, new MouseEvent('auxclick', { bubbles: true, button: 1 }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onCardAuxClick).not.toHaveBeenCalled();
  });

  it('moves focus to the next grid item before removing the focused card', () => {
    render(
      <div role="feed">
        <article role="article" tabIndex={0}>
          <PostUnavailable message="Deleted." onRemove={vi.fn()} />
        </article>
        <article role="article" tabIndex={0} data-testid="next-post-card" />
      </div>,
    );
    const button = screen.getByRole('button', { name: 'Remove' });
    button.focus();

    fireEvent.click(button);

    expect(screen.getByTestId('next-post-card')).toHaveFocus();
  });

  it('disables the remove button while removal is pending', () => {
    render(<PostUnavailable message="Deleted." onRemove={vi.fn()} isRemoving />);
    const button = screen.getByRole('button', { name: 'Remove' });

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

describe('PostUnavailable - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<PostUnavailable message="This post has been deleted by its author." />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with remove action', () => {
    const { container } = render(
      <PostUnavailable message="Post not found." onRemove={vi.fn()} removeDataCy="post-missing-remove-btn" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot while removing', () => {
    const { container } = render(
      <PostUnavailable message="This post has been deleted by its author." onRemove={vi.fn()} isRemoving />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
