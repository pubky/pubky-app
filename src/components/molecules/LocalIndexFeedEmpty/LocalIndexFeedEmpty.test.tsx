import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalIndexFeedEmpty } from './LocalIndexFeedEmpty';

const requireAuth = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: false, isWaiting: false, requireAuth, waitForAuth: vi.fn() }),
}));

describe('LocalIndexFeedEmpty', () => {
  it('says the network is still loading during the first sync, with no action', () => {
    render(<LocalIndexFeedEmpty reason="first-sync" />);

    expect(screen.getByRole('heading', { name: 'Loading your network' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a visitor to join, through the sign-in prompt', () => {
    render(<LocalIndexFeedEmpty reason="signed-out" />);

    expect(screen.getByRole('heading', { name: 'Sign in to see your feed' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join Pubky' }));
    expect(requireAuth).toHaveBeenCalledOnce();
  });
});
