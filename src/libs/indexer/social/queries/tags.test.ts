// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALICE, BRAN, CLEO, DION, recordsOf, socialNetwork } from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { InvalidQueryError } from './queries.errors';
import { hotTags } from './tags';

const view = buildSocialView(recordsOf(socialNetwork()));

describe('hotTags', () => {
  it('ranks the labels on posts by taggers, then posts tagged', () => {
    const answer = hotTags(view, {});

    expect(answer.data).toEqual([
      { label: 'rust', taggers_id: [CLEO, DION, BRAN], tagged_count: 1, taggers_count: 3 },
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
    ]);
    expect(answer.coverage.kind).toBe('scope');
    expect(hotTags(view, { taggers_limit: 1, limit: 1 }).data).toEqual([
      { label: 'rust', taggers_id: [CLEO], tagged_count: 1, taggers_count: 3 },
    ]);
  });

  it('counts only the taggers within a reach', () => {
    expect(hotTags(view, { user_id: ALICE, reach: 'following', timeframe: 'this_month' }).data).toEqual([
      { label: 'rust', taggers_id: [CLEO, BRAN], tagged_count: 1, taggers_count: 2 },
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
    ]);
  });

  it('rejects what the central indexer rejects', () => {
    expect(() => hotTags(view, { reach: 'following' })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, { user_id: ALICE })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, { timeframe: 'forever' })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, { limit: 41 })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, { taggers_limit: 21 })).toThrow(InvalidQueryError);
  });
});
