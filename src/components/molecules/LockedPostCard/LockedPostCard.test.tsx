import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LockedPostCard } from './LockedPostCard';

describe('LockedPostCard', () => {
  it('falls back to the default title while the creator has not typed one', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Locked post');
  });

  it('falls back to the default title for a whitespace-only title', () => {
    render(<LockedPostCard title="   " />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('Locked post');
  });

  it('shows the creator-typed title', () => {
    render(<LockedPostCard title="My most famous quote" />);
    expect(screen.getByRole('heading', { level: 4 })).toHaveTextContent('My most famous quote');
  });

  // Nothing in this card acts: the lock does not exist until the composer's Post button runs.
  it('renders the Unlock control as inert', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });
});
