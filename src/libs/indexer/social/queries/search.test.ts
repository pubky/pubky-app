// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALICE, BRAN, CLEO, recordsOf, socialNetwork } from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { InvalidQueryError, UnavailableQueryError } from './queries.errors';
import { postsByContent, tagsByPrefix, usersById, usersByName, usersByTags } from './search';

const view = buildSocialView(recordsOf(socialNetwork()));

describe('user search', () => {
  it('finds users with a profile by name prefix, ignoring case and surrounding space', () => {
    const answer = usersByName(view, { prefix: 'AL' });

    expect(answer.data).toEqual([ALICE]);
    expect(answer.coverage.kind).toBe('scope');
    expect(usersByName(view, { prefix: ' b ' }).data).toEqual([BRAN]);
    expect(usersByName(view, { prefix: 'zz' }).data).toEqual([]);
    expect(() => usersByName(view, { prefix: '  ' })).toThrow(InvalidQueryError);
  });

  it('finds users by id prefix of at least three characters', () => {
    expect(usersById(view, { prefix: ALICE.slice(0, 3) }).data).toEqual([ALICE]);
    expect(() => usersById(view, { prefix: ALICE.slice(0, 2) })).toThrow(InvalidQueryError);
  });

  it('scores users by their taggers summed over the labels, optionally within a reach', () => {
    const answer = usersByTags(view, { tags: ['friend', 'dev'] });

    expect(answer.data).toEqual([{ user_id: BRAN, score: 3 }]);
    expect(answer.coverage.kind).toBe('scope');
    expect(usersByTags(view, { tags: ['Friend'] }).data).toEqual([{ user_id: BRAN, score: 2 }]);
    expect(usersByTags(view, { tags: ['dev'], user_id: ALICE, reach: 'following' }).data).toEqual([
      { user_id: BRAN, score: 1 },
    ]);
    expect(usersByTags(view, { tags: ['dev'], user_id: CLEO, reach: 'following' }).data).toEqual([]);
    expect(() => usersByTags(view, {})).toThrow(InvalidQueryError);
    expect(() => usersByTags(view, { tags: ['dev'], reach: 'following' })).toThrow(InvalidQueryError);
  });
});

describe('tag search', () => {
  it('finds labels on posts and users by folded prefix', () => {
    expect(tagsByPrefix(view, { prefix: 'R' }).data).toEqual(['rust']);
    expect(tagsByPrefix(view, { prefix: 'f' }).data).toEqual(['friend']);
    expect(tagsByPrefix(view, { prefix: 'w' }).data).toEqual([]);
    expect(() => tagsByPrefix(view, { prefix: '' })).toThrow(InvalidQueryError);
  });

  it('refuses full-text post search', () => {
    expect(() => postsByContent()).toThrow(UnavailableQueryError);
  });
});
