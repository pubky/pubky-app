// @vitest-environment node
import { buildUri } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { ALICE, BRAN, CLEO, DION, MINUTE_MS, recordsOf, socialNetwork, T0 } from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { notifications } from './notifications';
import { InvalidQueryError, UnavailableQueryError } from './queries.errors';

const network = socialNetwork();
const { a1, b1, repost, quote } = network.posts;
const view = buildSocialView(recordsOf(network));
const context = { seed: ALICE, now: () => T0 };
const minute = (n: number) => T0 + n * MINUTE_MS;
const uri = (author: string, postId: string) => buildUri(author, 'post', postId);
const a1Uri = uri(ALICE, a1.id);

describe('notifications', () => {
  it('derives the seed’s notifications from the authors in scope, newest first and undated ones last', () => {
    const answer = notifications(view, context, { user_id: ALICE });

    expect(answer.data).toEqual([
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
      { timestamp: 0, body: { type: 'follow', followed_by: BRAN } },
      {
        timestamp: 0,
        body: { type: 'tag_post', tagged_by: CLEO, tag_label: 'pubky', post_uri: a1Uri, post_kind: 'note' },
      },
      {
        timestamp: 0,
        body: { type: 'tag_post', tagged_by: CLEO, tag_label: 'rust', post_uri: a1Uri, post_kind: 'note' },
      },
      {
        timestamp: 0,
        body: { type: 'tag_post', tagged_by: DION, tag_label: 'rust', post_uri: a1Uri, post_kind: 'note' },
      },
      {
        timestamp: 0,
        body: { type: 'tag_post', tagged_by: BRAN, tag_label: 'rust', post_uri: a1Uri, post_kind: 'note' },
      },
    ]);
    expect(answer.coverage.kind).toBe('scope');
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

    expect(types({ skip: 1, limit: 2 })).toEqual([
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
});
