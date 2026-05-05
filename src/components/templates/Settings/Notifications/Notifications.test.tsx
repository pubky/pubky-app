import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Notifications } from './Notifications';

describe('Notifications', () => {
  it('renders notifications content', () => {
    render(<Notifications />);
    expect(screen.getByText('Platform notifications')).toBeInTheDocument();
  });

  it('renders all notification switches', () => {
    render(<Notifications />);
    expect(screen.getByText('New follower')).toBeInTheDocument();
    expect(screen.getByText('New reply to your post')).toBeInTheDocument();
    expect(screen.getByText('Someone mentioned your profile')).toBeInTheDocument();
    expect(screen.getByText('New repost to your post')).toBeInTheDocument();
    expect(screen.getByText('New friend')).toBeInTheDocument();
  });
});

describe('Notifications - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<Notifications />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
