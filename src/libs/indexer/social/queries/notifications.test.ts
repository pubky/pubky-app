// @vitest-environment node
import { buildFollow, buildPost, buildUri } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  at,
  BRAN,
  CLEO,
  DION,
  MINUTE_MS,
  recordsFrom,
  recordsOf,
  type SocialFile,
  socialNetwork,
  T0,
  withPartialActivity,
} from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { notifications } from './notifications';
import { InvalidQueryError, UnavailableQueryError } from './queries.errors';
import { isoOf } from './queries.types';

const network = socialNetwork();
const { a1, b1, repost, quote } = network.posts;
const view = buildSocialView(recordsOf(network));
const context = { seed: ALICE, now: () => T0 };
const minute = (n: number) => T0 + n * MINUTE_MS;
const uri = (author: string, postId: string) => buildUri(author, 'post', postId);
const a1Uri = uri(ALICE, a1.id);

describe('notifications', () => {
  it('derives the seed’s notifications from the authors in scope, newest first, follows and tags dated', () => {
    const answer = notifications(view, context, { user_id: ALICE });
    // The tags come after the last post, so they date to it; the follows came before the first.
    const tagPost = (tagger: string, label: string) => ({
      timestamp: minute(12),
      body: { type: 'tag_post', tagged_by: tagger, tag_label: label, post_uri: a1Uri, post_kind: 'note' },
    });

    expect(answer.data).toEqual([
      tagPost(CLEO, 'pubky'),
      tagPost(CLEO, 'rust'),
      tagPost(DION, 'rust'),
      tagPost(BRAN, 'rust'),
      {
        timestamp: minute(7),
        body: { type: 'mention', mentioned_by: CLEO, post_uri: uri(CLEO, quote.id), post_kind: 'note' },
      },
      {
        timestamp: minute(7),
        body: {
          type: 'repost',
          reposted_by: CLEO,
          embed_uri: a1Uri,
          repost_uri: uri(CLEO, quote.id),
          post_kind: 'note',
        },
      },
      {
        timestamp: minute(6),
        body: {
          type: 'repost',
          reposted_by: BRAN,
          embed_uri: a1Uri,
          repost_uri: uri(BRAN, repost.id),
          post_kind: 'note',
        },
      },
      {
        timestamp: minute(2),
        body: {
          type: 'reply',
          replied_by: BRAN,
          parent_post_uri: a1Uri,
          reply_uri: uri(BRAN, b1.id),
          post_kind: 'note',
        },
      },
      // Both follows date to the first post, so bran's is not earlier than alice's: he made the friendship.
      { timestamp: minute(1), body: { type: 'new_friend', followed_by: BRAN } },
    ]);
    expect(answer.coverage.kind).toBe('scope');
    expect(answer.coverage.note).toContain('estimated');
  });

  it('tells a follow from a new friend by which follow came later, and puts unknown times last', () => {
    const files: SocialFile[] = [
      { author: ALICE, ...at(10, () => buildPost(ALICE, { content: 'ten' })) },
      { author: CLEO, ...at(0, () => buildFollow(CLEO, ALICE)) },
      { author: BRAN, ...at(20, () => buildPost(BRAN, { content: 'twenty' })) },
      { author: ALICE, ...at(0, () => buildFollow(ALICE, CLEO)) },
      { author: CLEO, ...at(30, () => buildPost(CLEO, { content: 'thirty' })) },
      { author: ALICE, ...at(0, () => buildFollow(ALICE, BRAN)) },
      { author: BRAN, ...at(40, () => buildPost(BRAN, { content: 'forty' })) },
      { author: BRAN, ...at(0, () => buildFollow(BRAN, ALICE)) },
      { author: ALICE, ...at(50, () => buildPost(ALICE, { content: 'fifty' })) },
      { author: DION, ...at(0, () => buildFollow(DION, ALICE)) },
    ];
    const hops = new Map([
      [ALICE, 0],
      [BRAN, 1],
      [CLEO, 1],
      [DION, 1],
    ]);
    // Dion publishes elsewhere, on a homeserver with no post to date his follow by.
    const records = recordsFrom(files, hops).map((entry) =>
      entry.author === DION ? { ...entry, homeserver: 'hs2' } : entry,
    );

    expect(notifications(buildSocialView(records), context, { user_id: ALICE }).data).toEqual([
      { timestamp: minute(45), body: { type: 'new_friend', followed_by: BRAN } },
      { timestamp: minute(15), body: { type: 'follow', followed_by: CLEO } },
      { timestamp: 0, body: { type: 'follow', followed_by: DION } },
    ]);
  });

  it('notifies a profile tag and never the seed’s own acts', () => {
    const brans = notifications(view, { ...context, seed: BRAN }, { user_id: BRAN }).data.map(({ body }) => body);

    expect(brans.filter(({ type }) => type === 'tag_profile')).toEqual([
      { type: 'tag_profile', tagged_by: CLEO, tag_label: 'friend' },
      { type: 'tag_profile', tagged_by: ALICE, tag_label: 'friend' },
      { type: 'tag_profile', tagged_by: DION, tag_label: 'dev' },
    ]);
    expect(brans.some((body) => Object.values(body).includes(BRAN))).toBe(false);
  });

  it('pages by skip and limit and bounds by timestamp', () => {
    const types = (params: { skip?: number; limit?: number; start?: number; end?: number }) =>
      notifications(view, context, { user_id: ALICE, ...params }).data.map(({ timestamp, body }) => [
        body.type,
        timestamp,
      ]);

    expect(types({ skip: 5, limit: 2 })).toEqual([
      ['repost', minute(7)],
      ['repost', minute(6)],
    ]);
    expect(types({ start: minute(6), end: minute(2) })).toEqual([
      ['repost', minute(6)],
      ['reply', minute(2)],
    ]);
  });

  it('serves only the seed and rejects a bad page', () => {
    expect(() => notifications(view, context, { user_id: BRAN })).toThrow(UnavailableQueryError);
    expect(() => notifications(view, context, { user_id: ALICE, limit: 101 })).toThrow(InvalidQueryError);
  });

  it('says where its time order is complete while a member is loaded only partly', () => {
    const partial = buildSocialView(withPartialActivity(recordsOf(network), CLEO, BigInt(14)));
    const since = isoOf(partial.historyOf(CLEO).sinceMs);

    expect(notifications(partial, context, { user_id: ALICE }).coverage).toEqual({
      kind: 'scope',
      note: `events by authors in the scope; follow and tag times estimated from homeserver event order; activity of the scope loaded only partly, the latest start ${since}, estimated: an older item may still join between those served`,
    });
    expect(notifications(view, context, { user_id: ALICE }).coverage.note).toBe(
      'events by authors in the scope; follow and tag times estimated from homeserver event order',
    );
  });
});
