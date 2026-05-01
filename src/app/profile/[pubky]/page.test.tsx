import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DynamicProfilePage from './page';

vi.mock('@/templates/Profile/Posts/ProfilePostsPage', () => {
  return {
    ProfilePostsPage: () => <div data-testid="profile-page-posts">Posts</div>,
  };
});

vi.mock('@/templates/Profile/Profile/ProfileOverviewPage', () => {
  return {
    ProfileOverviewPage: () => <div data-testid="profile-page-profile">Profile</div>,
  };
});

describe('DynamicProfilePage', () => {
  it('renders both templates so CSS can pick the right one per viewport', () => {
    render(<DynamicProfilePage />);

    expect(screen.getByTestId('profile-page-profile')).toBeInTheDocument();
    expect(screen.getByTestId('profile-page-posts')).toBeInTheDocument();
  });

  it('wraps the Profile template so it is visible only below the lg breakpoint', () => {
    render(<DynamicProfilePage />);

    const wrapper = screen.getByTestId('profile-page-profile').parentElement;
    expect(wrapper).toHaveClass('lg:hidden');
  });

  it('wraps the Posts template so it is visible only at or above the lg breakpoint', () => {
    render(<DynamicProfilePage />);

    const wrapper = screen.getByTestId('profile-page-posts').parentElement;
    expect(wrapper).toHaveClass('hidden', 'lg:block');
  });

  it('emits both templates during server render so HTML is identical for every visitor', () => {
    const html = renderToString(<DynamicProfilePage />);

    expect(html).toContain('profile-page-profile');
    expect(html).toContain('profile-page-posts');
  });
});
