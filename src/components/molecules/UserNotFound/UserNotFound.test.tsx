import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UserNotFound } from './UserNotFound';

const defaultProps = {
  title: 'User not found',
  subtitle: "The user you're looking for doesn't exist or may have been removed.",
  imageAlt: 'User not found',
  backToFeedLabel: 'Back to Feed',
  exploreTagsLabel: 'Explore Tags',
  onBackToFeed: vi.fn(),
  onExploreTags: vi.fn(),
};

describe('UserNotFound', () => {
  it('renders the user not found message and actions', () => {
    render(<UserNotFound {...defaultProps} />);

    expect(screen.getByText('User not found')).toBeInTheDocument();
    expect(screen.getByText("The user you're looking for doesn't exist or may have been removed.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Explore Tags' })).toBeInTheDocument();
  });

  it('renders the background image with correct alt text', () => {
    render(<UserNotFound {...defaultProps} />);

    const image = screen.getByAltText('User not found');
    expect(image).toBeInTheDocument();
  });

  it('invokes navigation callbacks when buttons are clicked', async () => {
    const user = userEvent.setup();
    render(<UserNotFound {...defaultProps} />);

    await user.click(screen.getByRole('button', { name: 'Back to Feed' }));
    expect(defaultProps.onBackToFeed).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Explore Tags' }));
    expect(defaultProps.onExploreTags).toHaveBeenCalledTimes(1);
  });

  describe('Snapshots', () => {
    it('matches snapshot', () => {
      const { container } = render(<UserNotFound {...defaultProps} />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
