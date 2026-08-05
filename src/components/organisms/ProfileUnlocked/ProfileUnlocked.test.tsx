import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UseUnlockedListResult } from '@/hooks/useUnlockedList/useUnlockedList.types';
import { UnlockedListProvider } from '@/providers/UnlockedListProvider/UnlockedListProvider';
import type { TUnlockedListItem } from '@/services/locks/locks.types';
import { ProfileUnlocked } from './ProfileUnlocked';
import { UNLOCKED_SKELETON_COUNT } from './ProfileUnlocked.skeleton';

// The cards render through PostBody → PostText, which reads the route to decide truncation.
vi.mock('next/navigation', () => ({ usePathname: () => '/profile/unlocked' }));
vi.mock('@/controllers/locks/locks', () => ({
  LocksController: { fetchReplicatedAttachments: vi.fn().mockResolvedValue([]) },
}));

const item = (lockId: string, content: string): TUnlockedListItem => ({
  lockId,
  post: { content, kind: 'short', attachments: null },
  unlockedAt: 1,
});

const renderWith = (value: Partial<UseUnlockedListResult>) => {
  const state: UseUnlockedListResult = { items: [], count: 0, isLoading: false, isError: false, ...value };
  return render(
    <UnlockedListProvider value={state}>
      <ProfileUnlocked />
    </UnlockedListProvider>,
  );
};

describe('ProfileUnlocked', () => {
  it('shows placeholder cards while the list loads', () => {
    const { container } = renderWith({ isLoading: true });

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(UNLOCKED_SKELETON_COUNT);
  });

  it('renders the unlocked items under the UNLOCKED label', () => {
    renderWith({ items: [item('LOCK1', 'first secret'), item('LOCK2', 'second secret')], count: 2 });

    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.getByText('first secret')).toBeInTheDocument();
    expect(screen.getByText('second secret')).toBeInTheDocument();
  });

  it('shows the empty copy when nothing has been unlocked', () => {
    renderWith({});

    expect(screen.getByText("You haven't unlocked any content yet.")).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
  });

  it('distinguishes a failed read from an empty list', () => {
    renderWith({ isError: true });

    expect(screen.getByText("Couldn't load your unlocked content. Try again later.")).toBeInTheDocument();
  });
});
