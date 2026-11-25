// @vitest-environment node
import type { BuiltPost } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import { ALICE, BRAN, CLEO, DION, recordsOf, socialNetwork, T0 } from '../social.fixtures';
import { buildSocialView, type SocialView } from '../social.view';
import { bootstrap } from './bootstrap';

const network = socialNetwork();
const { a1, b1, repost, quote, article, image, collection } = network.posts;
const view = buildSocialView(recordsOf(network));
const context = { seed: ALICE, now: () => T0 };
const key = (author: string, post: BuiltPost) => `${author}:${post.id}`;

describe('bootstrap', () => {
  it('assembles the sign-in page from the scope', () => {
    const answer = bootstrap(view, context, { user_id: ALICE });
    const { users, posts, ids, indexed, notifications } = answer.data;

    expect(indexed).toBe(true);
    expect(ids.stream).toEqual([
      key(DION, collection),
      key(BRAN, image),
      key(ALICE, article),
      key(CLEO, quote),
      key(BRAN, repost),
      key(ALICE, a1),
    ]);
    expect(posts.map(({ details }) => `${details.author}:${details.id}`)).toEqual([...ids.stream, key(BRAN, b1)]);
    expect(ids.influencers).toEqual([CLEO, ALICE, BRAN]);
    expect(ids.recommended).toEqual([]);
    expect(ids.hot_tags.map(({ label }) => label)).toEqual(['rust', 'pubky']);
    expect(users.map(({ details }) => details.id)).toEqual([CLEO, ALICE, BRAN]);
    expect(users[1].relationship).toEqual({ following: false, followed_by: false });
    expect(users[2].relationship).toEqual({ following: true, followed_by: true });
    expect(notifications).toHaveLength(9);
    expect(answer.coverage.kind).toBe('scope');
  });

  it('serves a user the scope has no profile of, with no viewer and no notifications', () => {
    const { users, indexed, notifications, ids } = bootstrap(view, context, { user_id: 'stranger' }).data;

    expect(indexed).toBe(false);
    expect(notifications).toEqual([]);
    expect(ids.recommended).toEqual([]);
    expect(ids.stream).toHaveLength(6);
    expect(users.map(({ details }) => details.id)).toEqual([CLEO, ALICE, BRAN]);
  });

  it('leaves out the notifications of anyone but the seed', () => {
    expect(bootstrap(view, context, { user_id: BRAN }).data.notifications).toEqual([]);
  });

  it('never throws: a part that fails is empty and the others are served', () => {
    const broken: SocialView = {
      ...view,
      rootPostsBy: () => {
        throw new Error('unreadable');
      },
      followers: () => {
        throw new Error('unreadable');
      },
      profile: () => {
        throw new Error('unreadable');
      },
    };
    const { posts, ids, users, notifications, indexed } = bootstrap(broken, context, { user_id: ALICE }).data;

    expect(indexed).toBe(false);
    expect(posts).toEqual([]);
    expect(ids.stream).toEqual([]);
    expect(ids.influencers).toEqual([]);
    expect(notifications).toEqual([]);
    expect(users).toEqual([]);
    expect(ids.hot_tags.map(({ label }) => label)).toEqual(['rust', 'pubky']);
  });
});
