import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NewPostsButton } from './NewPostsButton';

describe('NewPostsButton', () => {
  it('renders nothing when visible is false', () => {
    const { container } = render(<NewPostsButton count={5} onClick={vi.fn()} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when count is 0', () => {
    const { container } = render(<NewPostsButton count={0} onClick={vi.fn()} visible={true} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when both visible is false and count is 0', () => {
    const { container } = render(<NewPostsButton count={0} onClick={vi.fn()} visible={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders button when visible is true and count is greater than 0', () => {
    render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} />);
    expect(screen.getByTestId('new-posts-button')).toBeInTheDocument();
  });

  it('displays singular text for 1 new post', () => {
    render(<NewPostsButton count={1} onClick={vi.fn()} visible={true} />);
    expect(screen.getByText(/See 1 new post/)).toBeInTheDocument();
  });

  it('displays plural text for multiple new posts', () => {
    render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} />);
    expect(screen.getByText(/See 5 new posts/)).toBeInTheDocument();
  });

  it('displays correct count for large numbers', () => {
    render(<NewPostsButton count={100} onClick={vi.fn()} visible={true} />);
    expect(screen.getByText(/See 100 new posts/)).toBeInTheDocument();
  });

  it('calls onClick when button is clicked', () => {
    const mockOnClick = vi.fn();
    render(<NewPostsButton count={5} onClick={mockOnClick} visible={true} />);

    const button = screen.getByTestId('new-posts-button');
    fireEvent.click(button);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('renders arrow up icon', () => {
    render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} />);
    expect(document.querySelector('.lucide-arrow-up')).toBeInTheDocument();
  });

  it('has full width styling when not scrolled (default)', () => {
    render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} />);
    const button = screen.getByTestId('new-posts-button');
    expect(button).toHaveClass('w-full');
    expect(button).not.toHaveClass('fixed');
  });

  it('has fixed positioning when scrolled', () => {
    render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} isScrolled={true} />);
    const button = screen.getByTestId('new-posts-button');
    expect(button).toHaveClass('fixed');
    expect(button).not.toHaveClass('relative');
  });
});

describe('NewPostsButton - Snapshots', () => {
  it('matches snapshot with 1 new post', () => {
    const { container } = render(<NewPostsButton count={1} onClick={vi.fn()} visible={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple new posts', () => {
    const { container } = render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when not visible', () => {
    const { container } = render(<NewPostsButton count={5} onClick={vi.fn()} visible={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when count is 0', () => {
    const { container } = render(<NewPostsButton count={0} onClick={vi.fn()} visible={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when scrolled (fixed position)', () => {
    const { container } = render(<NewPostsButton count={5} onClick={vi.fn()} visible={true} isScrolled={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
