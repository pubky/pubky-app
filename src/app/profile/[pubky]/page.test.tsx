import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DynamicProfilePage, { generateMetadata } from './page';

vi.mock('@/templates/Profile/Posts/ProfilePostsPage', () => {
  return {
    ProfilePostsPage: () => <div data-testid="profile-page-posts">Posts</div>,
  };
});

describe('DynamicProfilePage', () => {
  it('renders the posts template as the canonical profile page', () => {
    render(<DynamicProfilePage />);

    expect(screen.getByTestId('profile-page-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-page-profile')).not.toBeInTheDocument();
  });

  it('does not wrap the posts template in viewport-specific CSS toggles', () => {
    render(<DynamicProfilePage />);

    const wrapper = screen.getByTestId('profile-page-posts').parentElement;
    expect(wrapper).not.toHaveClass('hidden', 'lg:block', 'lg:hidden');
  });

  it('emits only the posts template during server render', () => {
    const html = renderToString(<DynamicProfilePage />);

    expect(html).toContain('profile-page-posts');
    expect(html).not.toContain('profile-page-profile');
  });
});

describe('generateMetadata', () => {
  it('emits a canonical alternate pointing at /profile/[pubky]', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ pubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy' }),
    });

    expect(metadata.alternates?.canonical).toBe('/profile/o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');
  });

  it('strips the pubky prefix so the canonical matches the canonical route', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ pubky: 'pubkyo1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy' }),
    });

    expect(metadata.alternates?.canonical).toBe('/profile/o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');
  });

  it('strips the legacy pk: prefix from URL-encoded pubky params', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ pubky: 'pk%3Ao1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy' }),
    });

    expect(metadata.alternates?.canonical).toBe('/profile/o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy');
  });
});
