import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePageMobileMenu, PROFILE_MENU_ITEMS } from './ProfilePageMobileMenu';
import { PROFILE_PAGE_TYPES } from '@/app/profile/types';

vi.mock('@/hooks', async () => {
  const actual = await vi.importActual<typeof import('@/hooks')>('@/hooks');
  return {
    ...actual,
    useRequireAuth: () => ({
      requireAuth: (cb: () => void) => cb(),
    }),
  };
});

describe('ProfilePageMobileMenu', () => {
  it('renders all menu items for own profile', () => {
    render(<ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />);
    PROFILE_MENU_ITEMS.forEach((item) => {
      expect(screen.getByLabelText(item.label)).toBeInTheDocument();
    });
  });

  it('hides ownProfileOnly items when viewing another user profile', () => {
    const { container } = render(
      <ProfilePageMobileMenu
        activePage={PROFILE_PAGE_TYPES.PROFILE}
        onPageChangeAction={() => {}}
        isOwnProfile={false}
      />,
    );

    const visibleCount = PROFILE_MENU_ITEMS.filter((item) => !item.ownProfileOnly).length;
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(visibleCount);

    // Notifications is ownProfileOnly — must not render
    expect(screen.queryByLabelText('Notifications')).not.toBeInTheDocument();
  });

  it('renders correct number of menu items', () => {
    const { container } = render(
      <ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(PROFILE_MENU_ITEMS.length);
  });

  it('marks the active item with aria-current="page"', () => {
    const { container } = render(
      <ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.FOLLOWING} onPageChangeAction={() => {}} />,
    );
    const activeButton = container.querySelector('button[aria-current="page"]');
    expect(activeButton).toBeInTheDocument();
    expect(activeButton).toHaveAttribute('aria-label', 'Following');
  });

  it('exposes the profile-page-mobile-menu data-testid on the root', () => {
    const { container } = render(
      <ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveAttribute('data-testid', 'profile-page-mobile-menu');
  });

  it('renders with sticky positioning', () => {
    const { container } = render(
      <ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('sticky', 'top-(--header-height-mobile)');
  });

  it('calls onPageChangeAction (via requireAuth) with correct pageType when clicked', async () => {
    const user = userEvent.setup();
    const onPageChangeAction = vi.fn();

    render(<ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.PROFILE} onPageChangeAction={onPageChangeAction} />);

    await user.click(screen.getByLabelText('Following'));
    expect(onPageChangeAction).toHaveBeenCalledWith(PROFILE_PAGE_TYPES.FOLLOWING);
  });
});

describe('ProfilePageMobileMenu - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(
      <ProfilePageMobileMenu activePage={PROFILE_PAGE_TYPES.NOTIFICATIONS} onPageChangeAction={() => {}} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
