import { fireEvent, render, screen } from '@testing-library/react';
import { MessageCircle, Tag } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { PostActionButton } from './PostActionButton';

describe('PostActionButton', () => {
  it('renders the post’s filled action pill with its icon and count', () => {
    const onClick = vi.fn();
    render(<PostActionButton icon={Tag} count={3} ariaLabel="Tag post (3)" onClick={onClick} data-cy="post-tag-btn" />);

    const button = screen.getByRole('button', { name: 'Tag post (3)' });
    expect(button).toHaveAttribute('data-variant', 'secondary');
    expect(button).toHaveAttribute('data-size', 'sm');
    expect(button).toHaveAttribute('data-cy', 'post-tag-btn');
    expect(button).toHaveClass('border-none', 'shadow-xs');
    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(screen.getByText('3')).toHaveClass('text-xs', 'font-bold', 'text-muted-foreground');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows no number without a count, and a text count as given', () => {
    const { rerender } = render(<PostActionButton icon={Tag} ariaLabel="Tags" />);
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveTextContent('');

    rerender(<PostActionButton icon={Tag} count="20+" ariaLabel="Tags" />);
    expect(screen.getByRole('button', { name: 'Tags' })).toHaveTextContent('20+');
  });

  it('applies the visual variant to the pill and its count', () => {
    render(<PostActionButton icon={Tag} count={2} variant="visual" ariaLabel="Tag post (2)" />);

    expect(screen.getByRole('button', { name: 'Tag post (2)' })).toHaveClass('bg-black/40', 'text-white');
    expect(screen.getByText('2')).toHaveClass('text-white/80');
  });

  it('fills the pill with the card colour on a muted surface, keeping the post’s pill unchanged', () => {
    const { rerender } = render(<PostActionButton icon={Tag} ariaLabel="Tags" />);
    let button = screen.getByRole('button', { name: 'Tags' });
    expect(button).toHaveClass('bg-action-pill', 'hover:bg-accent');
    expect(button).not.toHaveClass('bg-card');

    rerender(<PostActionButton icon={Tag} surface="muted" ariaLabel="Tags" />);
    button = screen.getByRole('button', { name: 'Tags' });
    expect(button).toHaveClass('border-none', 'shadow-xs', 'bg-card', 'hover:bg-card/70');
    expect(button).not.toHaveClass('bg-action-pill', 'hover:bg-accent');

    rerender(<PostActionButton icon={Tag} surface="muted" variant="visual" ariaLabel="Tags" />);
    button = screen.getByRole('button', { name: 'Tags' });
    expect(button).toHaveClass('bg-black/40');
    expect(button).not.toHaveClass('bg-card');
  });

  it('is a disabled button when disabled', () => {
    render(<PostActionButton icon={MessageCircle} ariaLabel="Reply" disabled />);

    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled();
  });
});
