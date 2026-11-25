// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALICE, BRAN, CLEO, DAY_MS, DION, HOUR_MS, recordsOf, socialNetwork, T0 } from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { InvalidQueryError } from './queries.errors';
import { hotTags } from './tags';

const view = buildSocialView(recordsOf(socialNetwork()));
/** An hour after the network was written, so every tag is inside the trailing timeframes. */
const context = { seed: ALICE, now: () => T0 + HOUR_MS };

describe('hotTags', () => {
  it('ranks the labels on posts by taggers, then posts tagged', () => {
    const answer = hotTags(view, context, {});

    expect(answer.data).toEqual([
      { label: 'rust', taggers_id: [CLEO, DION, BRAN], tagged_count: 1, taggers_count: 3 },
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
    ]);
    expect(answer.coverage.kind).toBe('scope');
    expect(hotTags(view, context, { taggers_limit: 1, limit: 1 }).data).toEqual([
      { label: 'rust', taggers_id: [CLEO], tagged_count: 1, taggers_count: 3 },
    ]);
  });

  it('counts only the taggers within a reach', () => {
    expect(hotTags(view, context, { user_id: ALICE, reach: 'following', timeframe: 'this_month' }).data).toEqual([
      { label: 'rust', taggers_id: [CLEO, BRAN], tagged_count: 1, taggers_count: 2 },
      { label: 'pubky', taggers_id: [CLEO], tagged_count: 1, taggers_count: 1 },
    ]);
  });

  it('keeps only the tags written inside the trailing timeframe, by their estimated time', () => {
    const later = { ...context, now: () => T0 + 2 * DAY_MS };

    expect(hotTags(view, later, { timeframe: 'today' }).data).toEqual([]);
    expect(hotTags(view, later, { timeframe: 'this_week' }).data.map(({ label }) => label)).toEqual(['rust', 'pubky']);
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
