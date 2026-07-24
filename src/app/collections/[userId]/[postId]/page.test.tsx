import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CollectionPage, { generateMetadata } from './page';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/templates/Collection/Collection', () => ({
  Collection: (p: { postId: string }) => <div data-testid="collection-template" data-post-id={p.postId} />,
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AUTHOR_PUBKY = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const POST_ID = '0034BBBDFK83G';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CollectionPage (route)', () => {
  it('builds the composite id from params and forwards it to the Collection template', async () => {
    const result = await CollectionPage({
      params: Promise.resolve({ userId: AUTHOR_PUBKY, postId: POST_ID }),
    });

    expect(result.props.postId).toBe(`${AUTHOR_PUBKY}:${POST_ID}`);

    render(result);

    expect(screen.getByTestId('collection-template')).toHaveAttribute('data-post-id', `${AUTHOR_PUBKY}:${POST_ID}`);
  });
});

describe('generateMetadata (collection route)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const jsonResponse = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

  it('builds title/description and omits static images for a collection post', async () => {
    // First fetch = user details, second = post details.
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'collection', content: '{"name":"Art"}' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: AUTHOR_PUBKY, postId: POST_ID }),
    });

    expect(metadata.title).toBe('Alice on Pubky');
    expect(metadata.description).toBe('Art');
    expect(metadata.openGraph).not.toHaveProperty('images');
    expect(metadata.twitter).not.toHaveProperty('images');
  });

  it('returns empty metadata for a non-collection post', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ name: 'Alice' }))
      .mockResolvedValueOnce(jsonResponse({ kind: 'short', content: 'hi' }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ userId: AUTHOR_PUBKY, postId: POST_ID }),
    });

    expect(metadata).toEqual({});
  });
});
