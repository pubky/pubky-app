import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertVibes } from './AlertVibes';

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'vibes-test-user' }),
}));

const storageKey = 'pubky-feature-discovery:vibes-test-user:vibes-alert-v1';
beforeEach(() => localStorage.clear());

describe('AlertVibes', () => {
  it.each(['vibes.pubky.app', 'Try now'])('records Try and dismisses from the %s link', (name) => {
    render(<AlertVibes />);
    fireEvent.click(screen.getByRole('link', { name }));
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ tried: true });
    expect(screen.queryByRole('region', { name: 'Discover Pubky Vibes' })).not.toBeInTheDocument();
  });

  it('snoozes when Later is clicked', () => {
    render(<AlertVibes />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toMatchObject({ tried: false, laterCount: 1 });
    expect(screen.queryByRole('region', { name: 'Discover Pubky Vibes' })).not.toBeInTheDocument();
  });

  it('renders nothing for a previously dismissed account', () => {
    localStorage.setItem(storageKey, JSON.stringify({ tried: true, laterCount: 0, nextShowAt: 0 }));
    const { container } = render(<AlertVibes />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('AlertVibes - Snapshots', () => {
  it('matches the visible alert', () => {
    const { container } = render(<AlertVibes />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
