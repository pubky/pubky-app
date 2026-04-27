import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserInfoPopoverFollowButton } from './UserInfoPopoverFollowButton';

describe('UserInfoPopoverFollowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Follow state when not following', () => {
    const onClick = vi.fn();
    render(<UserInfoPopoverFollowButton isFollowing={false} isLoading={false} onClick={onClick} />);

    const button = screen.getByLabelText('Follow');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders Unfollow state when following', () => {
    render(<UserInfoPopoverFollowButton isFollowing={true} isLoading={false} onClick={vi.fn()} />);
    expect(screen.getByLabelText('Unfollow')).toBeInTheDocument();
  });

  it('renders loading state and disables button', () => {
    render(<UserInfoPopoverFollowButton isFollowing={false} isLoading={true} onClick={vi.fn()} />);
    const button = screen.getByLabelText('Follow') as HTMLButtonElement;
    expect(button).toBeDisabled();
    expect(button.querySelector('.lucide-loader-circle')).toBeInTheDocument();
  });
});

describe('UserInfoPopoverFollowButton - Snapshots', () => {
  it('matches snapshot for follow state', () => {
    const { container } = render(
      <UserInfoPopoverFollowButton isFollowing={false} isLoading={false} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for following state', () => {
    const { container } = render(
      <UserInfoPopoverFollowButton isFollowing={true} isLoading={false} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for loading state', () => {
    const { container } = render(
      <UserInfoPopoverFollowButton isFollowing={false} isLoading={true} onClick={vi.fn()} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
