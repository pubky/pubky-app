// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCrawler } from '../crawler';
import { FakeNetwork } from '../fakeNetwork';
import { createMemoryStore } from '../memoryStore';
import { createSocialDomain, SOCIAL_ACTIVITY, SOCIAL_GRAPH } from './social.domain';
import { ALICE, BRAN, CLEO, DION, MINUTE_MS, recordsOf, socialNetwork, T0 } from './social.fixtures';
import type { AuthorRecords, SocialData } from './social.types';
import { buildSocialView, type SocialPost } from './social.view';

const DAY_MS = 24 * 60 * MINUTE_MS;
const ids = (posts: readonly SocialPost[]) => posts.map(({ author, postId }) => `${author}/${postId}`);

describe('the social domain behind the crawler', () => {
  it('crawls a network from a seed into the view a full index gives', async () => {
    const fixture = socialNetwork();
    const { a1, b1, repost, quote, image } = fixture.posts;
    const network = new FakeNetwork().addHomeserver('hs1').addHomeserver('hs2');
    network.addUser(ALICE, 'hs1').addUser(BRAN, 'hs1').addUser(CLEO, 'hs2').addUser(DION, 'hs2');
    for (const { author, path, body } of fixture.writes) network.put(author, path, body);
    for (const { author, path } of fixture.deletes) network.del(author, path);
    const store = createMemoryStore<SocialData>();
    const domain = createSocialDomain();
    const crawler = createCrawler({ transport: network, store, domain, now: () => T0 + DAY_MS });

    const { members, failedHomeservers } = await crawler.syncScope(ALICE);
    const records: AuthorRecords[] = [];
    for (const [author, hop] of members) {
      const homeserver = (await store.readUserHomeserver(author))?.homeserver ?? null;
      if (homeserver === null) continue;
      const live = async (group: string) => (await store.readScope({ author, homeserver, group })).live;
      records.push({ author, hop, graph: await live(SOCIAL_GRAPH), activity: await live(SOCIAL_ACTIVITY) });
    }
    const view = buildSocialView(records);
    const expected = buildSocialView(recordsOf(fixture));

    expect(failedHomeservers).toEqual([]);
    expect(members).toEqual(
      new Map([
        [ALICE, 0],
        [BRAN, 1],
        [CLEO, 1],
        [DION, 2],
      ]),
    );
    expect(ids(view.timeline(view.following(ALICE)))).toEqual([
      `${BRAN}/${image.id}`,
      `${CLEO}/${quote.id}`,
      `${BRAN}/${repost.id}`,
    ]);
    expect(view.timeline(members.keys(), { includeReplies: true })).toEqual(
      expected.timeline(members.keys(), { includeReplies: true }),
    );
    expect(view.postCounts(ALICE, a1.id)).toEqual({ replies: 1, reposts: 2, tags: 4, uniqueTags: 2 });
    expect(view.postCounts(BRAN, b1.id)).toEqual({ replies: 1, reposts: 0, tags: 0, uniqueTags: 0 });
    for (const user of members.keys()) {
      expect(view.userCounts(user)).toEqual(expected.userCounts(user));
      expect(view.profile(user)).toEqual(expected.profile(user));
    }
    expect(view.userCounts(BRAN)).toMatchObject({ posts: 3, followers: 1, friends: 1, tagged: 3 });
  });
});
