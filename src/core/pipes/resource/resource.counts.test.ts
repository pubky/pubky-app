import { describe, expect, it } from 'vitest';
import { mergeResourceCounts } from './resource.counts';

describe('mergeResourceCounts', () => {
  const canonical = { resourceId: 'a', replies: 1, embeds: 2, collections: 0 };
  const share = { resourceId: 'b', replies: 2, embeds: 1, collections: 1 };

  it('sums the spellings’ counts under the first known id, with every known id', () => {
    expect(mergeResourceCounts([canonical, share])).toEqual({
      resourceId: 'a',
      resourceIds: ['a', 'b'],
      replies: 3,
      embeds: 3,
      collections: 1,
    });
    expect(mergeResourceCounts([null, share])).toMatchObject({ resourceId: 'b', resourceIds: ['b'], replies: 2 });
  });

  it('has no counts while the link itself is not read, and leaves out a spelling not read', () => {
    expect(mergeResourceCounts([undefined, share])).toBeUndefined();
    expect(mergeResourceCounts([canonical, undefined])).toMatchObject({ resourceIds: ['a'], replies: 1 });
  });

  it('is null when Nexus knows none of the spellings', () => {
    expect(mergeResourceCounts([null, null])).toBeNull();
    expect(mergeResourceCounts([null, undefined])).toBeNull();
  });

  it('leaves a count no spelling has undefined, and one link’s counts as they are', () => {
    expect(mergeResourceCounts([{ resourceId: 'a' }, { resourceId: 'b', replies: 1 }])).toMatchObject({
      replies: 1,
      embeds: undefined,
      collections: undefined,
    });
    expect(mergeResourceCounts([canonical])).toBe(canonical);
    expect(mergeResourceCounts([null])).toBeNull();
    expect(mergeResourceCounts([undefined])).toBeUndefined();
  });
});
