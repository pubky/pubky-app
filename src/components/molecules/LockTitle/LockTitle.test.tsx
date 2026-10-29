import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LockTitle } from './LockTitle';

const KEY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
// A valid 52-character z-base-32 key that itself starts with "pubky".
const PUBKY_LEADING_KEY = `pubky${KEY.slice(5)}`;
const mocks = vi.hoisted(() => ({ profile: { name: 'Jane Whitlock' } as { name: string } | null }));

vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: () => ({ profile: mocks.profile, isLoading: false }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (s: { currentUserPubky: string | null }) => unknown) => selector({ currentUserPubky: null }),
}));
vi.mock('@/molecules/UserInfoPopover/UserInfoPopover', () => ({
  UserInfoPopover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

beforeEach(() => {
  mocks.profile = { name: 'Jane Whitlock' };
});

describe('LockTitle', () => {
  it('shows a mentioned user key as @<display name>, keeping the text around it (#2681)', () => {
    const { container } = render(<LockTitle title={`hello pubky${KEY} and more`} />);

    expect(container).toHaveTextContent('hello @Jane Whitlock and more');
    expect(container).not.toHaveTextContent(KEY);
  });

  it('keeps a mention whose key itself starts with "pubky"', () => {
    const { container } = render(<LockTitle title={`hi pubky${PUBKY_LEADING_KEY} there`} />);

    expect(container).toHaveTextContent('hi @Jane Whitlock there');
    expect(screen.getByRole('link', { name: '@Jane Whitlock' })).toHaveAttribute(
      'href',
      `/profile/${PUBKY_LEADING_KEY}`,
    );
  });

  it('accepts the legacy pk: prefix, as post text does', () => {
    const { container } = render(<LockTitle title={`pk:${KEY}`} />);
    expect(container).toHaveTextContent('@Jane Whitlock');
  });

  it('links the mention to the profile by default', () => {
    render(<LockTitle title={`hi pubky${KEY}`} />);
    expect(screen.getByRole('link', { name: '@Jane Whitlock' })).toHaveAttribute('href', `/profile/${KEY}`);
  });

  it('renders the mention as text when not interactive', () => {
    render(<LockTitle title={`hi pubky${KEY}`} interactive={false} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('@Jane Whitlock').tagName).toBe('SPAN');
  });

  it('applies the caller size to the mention', () => {
    render(<LockTitle title={`hi pubky${KEY}`} mentionClassName="text-xl" interactive={false} />);
    const mention = screen.getByText('@Jane Whitlock');
    expect(mention).toHaveClass('text-xl');
    expect(mention).not.toHaveClass('text-base');
  });

  it('falls back to the shortened key when the profile has no name', () => {
    mocks.profile = null;
    const { container } = render(<LockTitle title={`hi pubky${KEY}`} />);
    expect(container).toHaveTextContent('hi o1gg...j7dy');
  });

  it('leaves a title without a key untouched', () => {
    const { container } = render(<LockTitle title="Secret recipe" />);
    expect(container.innerHTML).toBe('Secret recipe');
  });
});
