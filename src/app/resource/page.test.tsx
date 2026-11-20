import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResourceRoutePage, { generateMetadata } from './page';

const mocks = vi.hoisted(() => ({
  ResourcePage: vi.fn(),
  // Next's redirect never returns: it throws to end the render.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
  RedirectType: { push: 'push', replace: 'replace' },
}));

vi.mock('@/templates/Resource/ResourcePage', () => ({
  ResourcePage: (props: { uri: string | null }) => {
    mocks.ResourcePage(props);
    return <div data-testid="resource-page">{props.uri ?? 'none'}</div>;
  },
}));

const params = (uri?: string | string[]) => Promise.resolve(uri === undefined ? {} : { uri });

describe('ResourceRoutePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the link in ?uri= to the page', async () => {
    render(await ResourceRoutePage({ searchParams: params('https://en.wikipedia.org/wiki/Bitcoin') }));

    expect(screen.getByTestId('resource-page')).toHaveTextContent('https://en.wikipedia.org/wiki/Bitcoin');
  });

  it('takes the first link when ?uri= is repeated', async () => {
    render(await ResourceRoutePage({ searchParams: params(['isbn:9780140328721', 'https://x.com']) }));

    expect(mocks.ResourcePage).toHaveBeenCalledWith({ uri: 'isbn:9780140328721' });
  });

  it.each([undefined, '', '   '])('passes no link for ?uri=%j', async (uri) => {
    render(await ResourceRoutePage({ searchParams: params(uri) }));

    expect(mocks.ResourcePage).toHaveBeenCalledWith({ uri: null });
  });

  it('titles the page, keeps it out of search engines, and makes its link the canonical URL', async () => {
    const metadata = await generateMetadata({ searchParams: params('isbn:9780140328721') });

    expect(metadata.title).toBe('External resource - Pubky App');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates.canonical).toBe('/resource?uri=isbn%3A9780140328721');
  });

  describe('a pubky.app object', () => {
    const KEY = 'apuij4kxbsj1wnh4douy7jptoscrttnkoz9zfo6k8dge1mfyadso';

    it.each([
      [`pubky://${KEY}/pub/pubky.app/posts/00360YV6W3NZG`, `/post/${KEY}/00360YV6W3NZG`],
      [`pubky://${KEY}/pub/social/v1/profile.json`, `/profile/${KEY}`],
    ])('sends %s to its own page, in place of this one in the history', async (uri, page) => {
      await expect(ResourceRoutePage({ searchParams: params(uri) })).rejects.toThrow('NEXT_REDIRECT');

      expect(mocks.redirect).toHaveBeenCalledWith(page, 'replace');
      expect(mocks.ResourcePage).not.toHaveBeenCalled();
    });

    it('keeps a file on this page, titled as a file', async () => {
      const file = `pubky://${KEY}/pub/pubky.app/files/00360YV6W3NZG`;
      render(await ResourceRoutePage({ searchParams: params(file) }));

      expect(mocks.redirect).not.toHaveBeenCalled();
      expect(mocks.ResourcePage).toHaveBeenCalledWith({ uri: file });
      expect((await generateMetadata({ searchParams: params(file) })).title).toBe('File - Pubky App');
    });
  });

  it('uses the bare route as canonical URL without a link', async () => {
    const metadata = await generateMetadata({ searchParams: params() });

    expect(metadata.alternates.canonical).toBe('/resource');
  });
});
