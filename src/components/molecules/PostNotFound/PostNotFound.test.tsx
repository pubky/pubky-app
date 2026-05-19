import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PostNotFound } from './PostNotFound';

const defaultProps = {
  title: 'Post not found',
  subtitle: "This post isn't available.",
  imageAlt: 'Post not found',
  backToFeedLabel: 'Back to Feed',
  viewProfileLabel: 'View profile',
  exploreTagsLabel: 'Explore Tags',
  onBackToFeed: vi.fn(),
  onViewProfile: vi.fn(),
  onExploreTags: vi.fn(),
};

describe('PostNotFound', () => {
  it('renders the message and three actions', () => {
    render(<PostNotFound {...defaultProps} />);

    expect(screen.getByText('Post not found')).toBeInTheDocument();
    expect(screen.getByText("This post isn't available.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore Tags' })).toBeInTheDocument();
  });

  it('hides View profile when onViewProfile is omitted', () => {
    render(<PostNotFound {...defaultProps} onViewProfile={undefined} />);

    expect(screen.queryByRole('button', { name: 'View profile' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore Tags' })).toBeInTheDocument();
  });

  it('invokes navigation callbacks when buttons are clicked', async () => {
    const user = userEvent.setup();
    render(<PostNotFound {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Back to Feed' }));
    expect(defaultProps.onBackToFeed).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'View profile' }));
    expect(defaultProps.onViewProfile).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Explore Tags' }));
    expect(defaultProps.onExploreTags).toHaveBeenCalledTimes(1);
  });

  describe('Snapshots', () => {
    it('matches snapshot with View profile', () => {
      const { container } = render(<PostNotFound {...defaultProps} />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot without View profile', () => {
      const { container } = render(<PostNotFound {...defaultProps} onViewProfile={undefined} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
