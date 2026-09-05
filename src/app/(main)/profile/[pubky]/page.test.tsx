import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => {
    // Keep the tests hermetic: default every fetch to 404 so the metadata falls
    // back to canonical-only unless a test provides a profile explicitly.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', { status: 404 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a canonical alternate pointing at /profile/[pubky]', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ pubky: PUBKY }) });

    expect(metadata.alternates?.canonical).toBe(`/profile/${PUBKY}`);
  });

  it('strips the pubky prefix so the canonical matches the canonical route', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ pubky: `pubky${PUBKY}` }) });

    expect(metadata.alternates?.canonical).toBe(`/profile/${PUBKY}`);
  });

  it('strips the legacy pk: prefix from URL-encoded pubky params', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ pubky: `pk%3A${PUBKY}` }) });

    expect(metadata.alternates?.canonical).toBe(`/profile/${PUBKY}`);
  });

  it('builds rich title/description without static images when the profile resolves', async () => {
    // First fetch = user details, second = counts (unused by metadata → left as 404).
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      jsonResponse({ name: 'Alice', bio: 'hello world', id: PUBKY, indexed_at: 1 }),
    );

    const metadata = await generateMetadata({ params: Promise.resolve({ pubky: PUBKY }) });

    expect(metadata.title).toBe('Alice on Pubky');
    expect(metadata.description).toBe('hello world');
    expect(metadata.openGraph).not.toHaveProperty('images');
    expect(metadata.twitter).not.toHaveProperty('images');
    expect(metadata.alternates?.canonical).toBe(`/profile/${PUBKY}`);
  });

  it('uses a shortened public key in the title when the profile has no name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ name: '', bio: '', id: PUBKY, indexed_at: 1 }));

    const metadata = await generateMetadata({ params: Promise.resolve({ pubky: PUBKY }) });

    expect(metadata.title).toMatch(/ on Pubky$/);
    expect(metadata.title).not.toBe(' on Pubky');
    expect(metadata.title).toContain('...');
  });

  it('falls back to canonical-only when the profile fetch fails', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ pubky: PUBKY }) });

    expect(metadata).toEqual({ alternates: { canonical: `/profile/${PUBKY}` } });
  });
});
