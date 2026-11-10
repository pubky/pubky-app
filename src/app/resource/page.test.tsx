import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResourceRoutePage, { generateMetadata } from './page';

const mocks = vi.hoisted(() => ({ ResourcePage: vi.fn() }));

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

  it('uses the bare route as canonical URL without a link', async () => {
    const metadata = await generateMetadata({ searchParams: params() });

    expect(metadata.alternates.canonical).toBe('/resource');
  });
});
