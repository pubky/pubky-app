import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertVibes } from './AlertVibes';

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'vibes-test-user' }),
}));

const storageKey = 'pubky-feature-discovery:vibes-test-user:vibes-alert-v2';
beforeEach(() => {
  localStorage.clear();
  // Inside the Lugano window, where the Home alert is due.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('AlertVibes', () => {
  it.each(['vibes.pubky.app', 'Try now'])('records Try and dismisses from the %s link', (name) => {
    render(<AlertVibes />);
    fireEvent.click(screen.getByRole('link', { name }));
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ done: true });
    expect(screen.queryByRole('region', { name: 'Discover Pubky Vibes' })).not.toBeInTheDocument();
  });

  it('snoozes when Later is clicked', () => {
    render(<AlertVibes />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ done: false, laterCount: 1 });
    expect(screen.queryByRole('region', { name: 'Discover Pubky Vibes' })).not.toBeInTheDocument();
  });

  it('renders nothing for a previously dismissed account', () => {
    localStorage.setItem(storageKey, JSON.stringify({ done: true, laterCount: 0, nextShowAt: 0 }));
    const { container } = render(<AlertVibes />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the copy, a Later button and a Try now link styled as a button', () => {
    render(<AlertVibes />);
    const alert = screen.getByRole('region', { name: 'Discover Pubky Vibes' });
    expect(alert).toHaveTextContent('Check out experimental features at vibes.pubky.app!');
    expect(screen.getByRole('button', { name: 'Later' })).toHaveAttribute('data-variant', 'dark-outline');
    const tryNow = screen.getByRole('link', { name: 'Try now' });
    expect(tryNow).toHaveAttribute('data-variant', 'dark');
    expect(tryNow).toHaveAttribute('href', 'https://vibes.pubky.app');
    expect(tryNow).toHaveAttribute('target', '_blank');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
