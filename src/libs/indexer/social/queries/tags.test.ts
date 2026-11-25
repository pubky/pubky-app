// @vitest-environment node
import { buildPost, buildTag, buildUri } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BRAN,
  CLEO,
  DAY_MS,
  DION,
  HOUR_MS,
  recordsFrom,
  recordsOf,
  type SocialFile,
  socialNetwork,
  T0,
} from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { InvalidQueryError } from './queries.errors';
import { hotTags } from './tags';

const view = buildSocialView(recordsOf(socialNetwork()));
/** An hour after the network was written, so every tag is inside the trailing timeframes. */
const context = { seed: ALICE, now: () => T0 + HOUR_MS };

describe('hotTags', () => {
  it('ranks the labels on posts by posts tagged, then by label', () => {
    const answer = hotTags(view, context, {});

    expect(answer.data).toEqual([
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
      { label: 'rust', taggers_id: [CLEO, DION, BRAN], tagged_count: 1, taggers_count: 3 },
    ]);
    expect(answer.coverage.kind).toBe('scope');
    expect(hotTags(view, context, { taggers_limit: 1, skip: 1, limit: 1 }).data).toEqual([
      { label: 'rust', taggers_id: [CLEO], tagged_count: 1, taggers_count: 3 },
    ]);
  });

  it('puts a label on more posts ahead of one with more taggers, and counts no tag on a user', () => {
    const [p1, p2] = at(1, () => [buildPost(ALICE, { content: 'one' }), buildPost(ALICE, { content: 'two' })]);
    const files: SocialFile[] = [
      { author: ALICE, ...p1 },
      { author: ALICE, ...p2 },
      ...at(2, () => [
        { author: ALICE, ...buildTag(ALICE, buildUri(ALICE, 'post', p1.id), 'wide') },
        { author: ALICE, ...buildTag(ALICE, buildUri(ALICE, 'post', p2.id), 'wide') },
        { author: ALICE, ...buildTag(ALICE, buildUri(ALICE, 'post', p1.id), 'loved') },
        { author: BRAN, ...buildTag(BRAN, buildUri(ALICE, 'post', p1.id), 'loved') },
        { author: BRAN, ...buildTag(BRAN, buildUri(ALICE, 'user'), 'wide') },
        { author: CLEO, ...buildTag(CLEO, buildUri(ALICE, 'user'), 'person') },
      ]),
    ];
    const tagged = buildSocialView(
      recordsFrom(
        files,
        new Map([
          [ALICE, 0],
          [BRAN, 1],
          [CLEO, 1],
        ]),
      ),
    );

    expect(hotTags(tagged, context, {}).data).toEqual([
      { label: 'wide', taggers_id: [ALICE], tagged_count: 2, taggers_count: 1 },
      { label: 'loved', taggers_id: [ALICE, BRAN], tagged_count: 1, taggers_count: 2 },
    ]);
  });

  it('counts only the taggers within a reach', () => {
    expect(hotTags(view, context, { user_id: ALICE, reach: 'following', timeframe: 'this_month' }).data).toEqual([
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
      { label: 'rust', taggers_id: [CLEO, BRAN], tagged_count: 1, taggers_count: 2 },
    ]);
  });

  it('keeps only the tags written inside the trailing timeframe, by their estimated time', () => {
    const later = { ...context, now: () => T0 + 2 * DAY_MS };

    expect(hotTags(view, later, { timeframe: 'today' }).data).toEqual([]);
    expect(hotTags(view, later, { timeframe: 'this_week' }).data.map(({ label }) => label)).toEqual(['pubky', 'rust']);
    expect(hotTags(view, context, { timeframe: 'today' }).coverage.note).toBe(
      'ranked inside the scope; tag times estimated from homeserver event order',
    );
    expect(hotTags(view, { ...context, now: () => T0 }, { timeframe: 'this_month' }).data).toEqual([]);
  });

  it('rejects what the central indexer rejects', () => {
    expect(() => hotTags(view, context, { reach: 'following' })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, context, { user_id: ALICE })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, context, { timeframe: 'forever' })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, context, { limit: 41 })).toThrow(InvalidQueryError);
    expect(() => hotTags(view, context, { taggers_limit: 21 })).toThrow(InvalidQueryError);
  });
});
