import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CollectionPage from './page';

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
