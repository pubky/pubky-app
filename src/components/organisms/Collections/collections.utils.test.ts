import { describe, expect, it } from 'vitest';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { uniqueAuthors } from './collections.utils';

describe('uniqueAuthors', () => {
  const authorA: Pubky = 'operrr8wsbpr3ue9d4qj41ge1kcc6r7fdiy6o3ugjrrhi4y77rd0';
  const authorB: Pubky = '6mfxozzqmb36rc9rgy3rykoyfghfao74n8igt5tf1boehproahoy';

  it('returns an empty array for no ids', () => {
    expect(uniqueAuthors([])).toEqual([]);
  });

  it('returns the author of a single id', () => {
    const id = buildCompositeId({ pubky: authorA, id: 'post-1' });
    expect(uniqueAuthors([id])).toEqual([authorA]);
  });

  it('dedupes repeated authors while preserving first-seen order', () => {
    const ids = [
      buildCompositeId({ pubky: authorB, id: 'post-1' }),
      buildCompositeId({ pubky: authorA, id: 'post-2' }),
      buildCompositeId({ pubky: authorB, id: 'post-3' }),
      buildCompositeId({ pubky: authorA, id: 'post-4' }),
    ];
    expect(uniqueAuthors(ids)).toEqual([authorB, authorA]);
  });

  it('skips malformed ids', () => {
    const valid = buildCompositeId({ pubky: authorA, id: 'post-1' });
    expect(uniqueAuthors(['not-a-composite-id', valid])).toEqual([authorA]);
  });

  it('returns an empty array when every id is malformed', () => {
    expect(uniqueAuthors(['nope', 'also-nope'])).toEqual([]);
  });
});
