import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  // Composer preview: no `onUnlock`, so the lock (which does not exist until Post) cannot be opened.
  it('renders the Unlock control as inert without an onUnlock handler', () => {
    render(<LockedPostCard title="" />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });

  // Reader: an `onUnlock` handler enables the control and runs on click.
  it('enables Unlock and calls onUnlock on click when a handler is given', () => {
    const onUnlock = vi.fn();
    render(<LockedPostCard title="" onUnlock={onUnlock} />);

    const button = screen.getByRole('button', { name: 'Unlock' });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit disabled even with a handler', () => {
    const onUnlock = vi.fn();
    render(<LockedPostCard title="" onUnlock={onUnlock} disabled />);
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
  });
});
