import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlertVibes } from '../AlertVibes/AlertVibes';
import { VibesCard } from './VibesCard';

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'vibes-test-user' }),
}));

beforeEach(() => localStorage.clear());

describe('VibesCard', () => {
  it('dismisses the mounted Home alert when opening the sidebar link in a background tab', () => {
    render(
      <>
        <AlertVibes />
        <VibesCard />
      </>,
    );
    expect(screen.getByRole('region', { name: 'Discover Pubky Vibes' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Try vibes.pubky.app' }), { metaKey: true });
    expect(screen.queryByRole('region', { name: 'Discover Pubky Vibes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try vibes.pubky.app' })).toBeInTheDocument();
  });

  it('renders the exact copy and opens Vibes in a new tab', () => {
    render(<VibesCard />);
    expect(screen.getByRole('heading', { name: 'Experimental' })).toBeInTheDocument();
    expect(screen.getByText('Get a taste of the future.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Try vibes.pubky.app' });
    expect(link).toHaveAttribute('href', 'https://vibes.pubky.app');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('stops home reminders after opening Vibes but keeps the sidebar entry available', () => {
    const { unmount } = render(<VibesCard />);
    fireEvent.click(screen.getByRole('link', { name: 'Try vibes.pubky.app' }));
    const saved = localStorage.getItem('pubky-feature-discovery:vibes-test-user:vibes-alert-v1');
    expect(JSON.parse(saved!)).toMatchObject({ tried: true });
    expect(screen.getByRole('link', { name: 'Try vibes.pubky.app' })).toBeInTheDocument();
    unmount();
    render(<VibesCard />);
    expect(screen.getByRole('link', { name: 'Try vibes.pubky.app' })).toBeInTheDocument();
  });
});

describe('VibesCard - Snapshots', () => {
  it('matches the permanent sidebar entry', () => {
    const { container } = render(<VibesCard />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
