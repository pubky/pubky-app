import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FollowButton } from './FollowButton';

const baseProps = {
  isFollowing: false,
  isLoading: false,
  isStatusLoading: false,
  displayName: 'Satoshi',
  onClick: vi.fn(),
};

describe('FollowButton', () => {
  describe('icon variant', () => {
    it('labels the follow action with the display name', () => {
      render(<FollowButton {...baseProps} variant="icon" />);

      expect(screen.getByRole('button', { name: 'Follow Satoshi' })).toBeInTheDocument();
    });

    it('labels the unfollow action when already following', () => {
      render(<FollowButton {...baseProps} variant="icon" isFollowing />);

      expect(screen.getByRole('button', { name: 'Unfollow Satoshi' })).toBeInTheDocument();
    });

    it('disables the button while the action is in flight', () => {
      render(<FollowButton {...baseProps} variant="icon" isLoading />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('disables the button while the follow status is still loading', () => {
      render(<FollowButton {...baseProps} variant="icon" isStatusLoading />);

      expect(screen.getByRole('button')).toBeDisabled();
    });

    it('forwards clicks', () => {
      const onClick = vi.fn();
      render(<FollowButton {...baseProps} variant="icon" onClick={onClick} />);

      fireEvent.click(screen.getByRole('button'));

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('iconWithText variant', () => {
    it('renders Follow text when not following', () => {
      render(<FollowButton {...baseProps} variant="iconWithText" />);

      expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument();
      expect(screen.getAllByText('Follow').length).toBeGreaterThan(0);
    });

    it('renders Following and Unfollow hover text when following', () => {
      render(<FollowButton {...baseProps} variant="iconWithText" isFollowing />);

      expect(screen.getByRole('button', { name: 'Unfollow' })).toBeInTheDocument();
      expect(screen.getByText('Following')).toBeInTheDocument();
      expect(screen.getByText('Unfollow')).toBeInTheDocument();
    });

    it('hides the text while loading', () => {
      render(<FollowButton {...baseProps} variant="iconWithText" isLoading />);

      expect(screen.getByRole('button')).toBeDisabled();
      expect(screen.queryByText('Follow')).not.toBeInTheDocument();
    });
  });
});
