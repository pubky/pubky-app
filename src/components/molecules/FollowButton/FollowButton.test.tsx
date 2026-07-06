import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowButton } from './FollowButton';

describe('FollowButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Follow state when not following', () => {
    const onClick = vi.fn();
    render(<FollowButton isFollowing={false} isLoading={false} onClick={onClick} />);

    const button = screen.getByLabelText('Follow');
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders Unfollow state when following', () => {
    render(<FollowButton isFollowing={true} isLoading={false} onClick={vi.fn()} />);
    expect(screen.getByLabelText('Unfollow')).toBeInTheDocument();
  });

  it('renders loading state and disables button', () => {
    render(<FollowButton isFollowing={false} isLoading={true} onClick={vi.fn()} />);
    const button = screen.getByLabelText('Follow') as HTMLButtonElement;
    expect(button).toBeDisabled();
    expect(button.querySelector('.lucide-loader-circle')).toBeInTheDocument();
  });

  it('appends a caller className', () => {
    render(<FollowButton isFollowing={false} isLoading={false} onClick={vi.fn()} className="flex-1" />);
    expect(screen.getByLabelText('Follow')).toHaveClass('flex-1');
  });
});

describe('FollowButton - Snapshots', () => {
  it('matches snapshot for follow state', () => {
    const { container } = render(<FollowButton isFollowing={false} isLoading={false} onClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for following state', () => {
    const { container } = render(<FollowButton isFollowing={true} isLoading={false} onClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for loading state', () => {
    const { container } = render(<FollowButton isFollowing={false} isLoading={true} onClick={vi.fn()} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
