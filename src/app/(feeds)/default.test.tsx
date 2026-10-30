import { describe, expect, it } from 'vitest';
import Default from './default';

describe('(feeds) children default', () => {
  it('renders the not-found page for URLs only the @post catch-all matched', () => {
    expect(() => Default()).toThrow(expect.objectContaining({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }));
  });
});
