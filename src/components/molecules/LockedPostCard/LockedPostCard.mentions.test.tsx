import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LockedPostCard } from './LockedPostCard';

const KEY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: { name: 'dummy-5' }, isLoading: false }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null }) => unknown) => selector({ currentUserPubky: null }),
}));
vi.mock('@/molecules/UserInfoPopover/UserInfoPopover', () => ({
  UserInfoPopover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('LockedPostCard title mentions (#2681)', () => {
  it('shows a user key in the lock title as @<display name>, as the link preview does', () => {
    render(<LockedPostCard title={`hello pubky${KEY}`} price={{ amount: '1234', asset: 'BTC' }} />);

    const heading = screen.getByRole('heading', { level: 4 });
    expect(heading).toHaveTextContent('hello @dummy-5');
    expect(heading).not.toHaveTextContent(KEY);
  });

  it('keeps the title as typed in the composer while the creator edits it', () => {
    render(
      <LockedPostCard
        editableTitle={{ value: `hello pubky${KEY}`, onChange: vi.fn() }}
        price={{ amount: '1234', asset: 'BTC' }}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Lock title' })).toHaveValue(`hello pubky${KEY}`);
  });
});
