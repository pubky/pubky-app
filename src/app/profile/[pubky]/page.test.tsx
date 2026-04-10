import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DynamicProfilePage from './page';

const mockUseIsMobile = vi.fn();

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

vi.mock('@/templates', () => ({
  ProfilePagePosts: () => <div data-testid="profile-page-posts">Posts</div>,
  ProfilePageProfile: () => <div data-testid="profile-page-profile">Profile</div>,
}));

describe('DynamicProfilePage', () => {
  it('renders the posts template during server render even for mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    const html = renderToString(<DynamicProfilePage />);

    expect(html).toContain('profile-page-posts');
    expect(html).not.toContain('profile-page-profile');
  });

  it('renders the profile template after mount on mobile', async () => {
    mockUseIsMobile.mockReturnValue(true);

    render(<DynamicProfilePage />);

    expect(await screen.findByTestId('profile-page-profile')).toBeInTheDocument();
  });

  it('renders the posts template on desktop', () => {
    mockUseIsMobile.mockReturnValue(false);

    render(<DynamicProfilePage />);

    expect(screen.getByTestId('profile-page-posts')).toBeInTheDocument();
  });
});
