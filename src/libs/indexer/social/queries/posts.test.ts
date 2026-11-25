// @vitest-environment node
import { buildTag, buildUri } from 'pubky-social-specs';
import { describe, expect, it } from 'vitest';
import {
  ALICE,
  BRAN,
  CLEO,
  DION,
  MINUTE_MS,
  recordsOf,
  socialNetwork,
  T0,
  withAuthor,
  withPartialActivity,
} from '../social.fixtures';
import { buildSocialView } from '../social.view';
import { postDetails, postsByIds, postTaggers, postTags, postView } from './posts';
import { InvalidQueryError, NotFoundQueryError } from './queries.errors';

const network = socialNetwork();
const { a1, b1, gone, orphan, repost, article, image, collection } = network.posts;
const view = buildSocialView(recordsOf(network));
/** Alice's activity loaded from cursor 11 on, three minutes in: a1 is older, the deleted post is not. */
const partial = buildSocialView(withPartialActivity(recordsOf(network), ALICE, BigInt(11)));
const a1Uri = buildUri(ALICE, 'post', a1.id);

function notFound(query: () => unknown): NotFoundQueryError {
  try {
    query();
  } catch (error) {
    if (error instanceof NotFoundQueryError) return error;
    throw error;
  }
  throw new Error('expected a NotFoundQueryError');
}

describe('postView', () => {
  it('serves a post with its scope counts, tags, relationships and the viewer’s tag files', () => {
    const answer = postView(view, { author_id: ALICE, post_id: a1.id, viewer_id: CLEO });

    expect(answer.data).toEqual({
      details: {
        content: `Hello pk:${BRAN} and pubky${CLEO}`,
        id: a1.id,
        indexed_at: T0 + MINUTE_MS,
        author: ALICE,
        kind: 'note',
        uri: a1Uri,
        attachments: [],
        lock: null,
        deleted: false,
      },
      counts: { tags: 4, unique_tags: 2, replies: 1, reposts: 2, collections: 1 },
      tags: [
        { label: 'rust', taggers: [CLEO, DION, BRAN], taggers_count: 3, tag_uri: buildTag(CLEO, a1Uri, 'rust').url },
        { label: 'pubky', taggers: [CLEO], taggers_count: 1, tag_uri: buildTag(CLEO, a1Uri, 'pubky').url },
      ],
      relationships: { replied: null, reposted: null, mentioned: [BRAN, CLEO] },
    });
    expect(answer.coverage.kind).toBe('scope');
  });

  it('points a reply at its parent and a repost at what it embeds, and pages the tags', () => {
    expect(postView(view, { author_id: BRAN, post_id: b1.id }).data.relationships.replied).toBe(a1Uri);
    expect(postView(view, { author_id: BRAN, post_id: repost.id }).data.relationships.reposted).toBe(a1Uri);
    expect(postView(view, { author_id: ALICE, post_id: a1.id, limit_tags: 1, limit_taggers: 1 }).data.tags).toEqual([
      { label: 'rust', taggers: [CLEO], taggers_count: 3, tag_uri: null },
    ]);
  });

  it('finds no post its author’s whole history lacks, and rejects a bad page', () => {
    const error = notFound(() => postView(view, { author_id: ALICE, post_id: gone.id }));

    expect(error).toMatchObject({
      code: 'indexer.query.not_found',
      entity: 'post',
      key: `${ALICE}:${gone.id}`,
      known: true,
      retryable: false,
      more: [],
    });
    expect(notFound(() => postView(view, { author_id: ALICE, post_id: 'not-an-id' })).known).toBe(true);
    expect(() => postView(view, { author_id: ALICE, post_id: a1.id, limit_tags: 0 })).toThrow(InvalidQueryError);
  });

  it('calls a post whose every version is tombstoned not found, even by an author outside the scope', () => {
    const referenced = withAuthor(recordsOf(network), DION, { membership: 'referenced' });
    const deleted = buildSocialView(
      withAuthor(referenced, DION, { deleted: { posts: new Set([orphan.id]), profile: false } }),
    );

    expect(notFound(() => postView(deleted, { author_id: DION, post_id: orphan.id }))).toMatchObject({
      known: true,
      more: [],
    });
    expect(notFound(() => postView(deleted, { author_id: DION, post_id: collection.id }))).toMatchObject({
      known: false,
      more: [{ kind: 'post', author: DION, postId: collection.id }],
    });
  });

  it('calls a post older than its author’s loaded history unknown, and one inside it not found', () => {
    const unknown = notFound(() => postView(partial, { author_id: ALICE, post_id: a1.id }));

    expect(unknown).toMatchObject({ known: false, retryable: true });
    expect(unknown.more).toEqual([{ kind: 'post', author: ALICE, postId: a1.id }]);
    expect(notFound(() => postView(partial, { author_id: ALICE, post_id: gone.id })).known).toBe(true);
    expect(notFound(() => postView(view, { author_id: 'stranger', post_id: a1.id })).known).toBe(false);
  });

  it('hints at the parent or embed of a post when it may only be unloaded', () => {
    const hint = [{ kind: 'post', author: ALICE, postId: a1.id }];

    expect(postView(partial, { author_id: BRAN, post_id: b1.id }).more).toEqual(hint);
    expect(postView(partial, { author_id: BRAN, post_id: repost.id }).more).toEqual(hint);
    expect(postView(view, { author_id: BRAN, post_id: b1.id }).more).toBeUndefined();
    expect(postView(view, { author_id: DION, post_id: orphan.id }).more).toBeUndefined();
  });
});

describe('postDetails', () => {
  it('serves the author’s own fields exactly, with articles and collections in their stored envelope', () => {
    const answer = postDetails(view, { author_id: ALICE, post_id: article.id });

    expect(answer.coverage.kind).toBe('exact');
    expect(answer.data.kind).toBe('article');
    expect(answer.data.indexed_at).toBe(T0 + 8 * MINUTE_MS);
    expect(JSON.parse(answer.data.content)).toEqual({
      title: 'On Pubky, revised',
      body: `Final, thanks pk:${DION}`,
      cover_image: null,
    });

    const curated = JSON.parse(postDetails(view, { author_id: DION, post_id: collection.id }).data.content) as {
      name: string;
      description: string | null;
      items: { uri: string }[];
    };
    expect(curated.name).toBe('Best of');
    expect(curated.description).toBeNull();
    expect(curated.items.map(({ uri }) => uri)).toEqual([
      a1Uri,
      buildUri(ALICE, 'post', article.id),
      'https://example.com/',
    ]);

    expect(postDetails(view, { author_id: BRAN, post_id: image.id }).data).toMatchObject({
      kind: 'image',
      content: 'A cat',
      attachments: ['https://example.com/cat.png'],
    });
  });

  it('finds no deleted post', () => {
    expect(notFound(() => postDetails(view, { author_id: ALICE, post_id: gone.id })).known).toBe(true);
    expect(notFound(() => postDetails(partial, { author_id: ALICE, post_id: a1.id })).retryable).toBe(true);
  });
});

describe('postsByIds', () => {
  it('serves the posts the scope holds in the order asked, skipping malformed and unknown keys', () => {
    const answer = postsByIds(view, {
      post_ids: [`${BRAN}:${b1.id}`, 'malformed', `${ALICE}:${gone.id}`, `${ALICE}:${a1.id}`],
      viewer_id: BRAN,
    });

    expect(answer.data.map(({ details }) => details.id)).toEqual([b1.id, a1.id]);
    expect(answer.data[1].tags[0].tag_uri).toBe(buildTag(BRAN, a1Uri, 'rust').url);
    expect(answer.coverage.kind).toBe('scope');
    expect(answer.more).toBeUndefined();
  });

  it('lists the skipped posts that may only be unloaded', () => {
    const answer = postsByIds(partial, {
      post_ids: [`${BRAN}:${b1.id}`, `${ALICE}:${a1.id}`, `${ALICE}:${gone.id}`, 'malformed'],
    });

    expect(answer.data.map(({ details }) => details.id)).toEqual([b1.id]);
    expect(answer.more).toEqual([{ kind: 'post', author: ALICE, postId: a1.id }]);
  });
});

describe('postTags and postTaggers', () => {
  it('pages a post’s tags and taggers', () => {
    expect(postTags(view, { author_id: ALICE, post_id: a1.id, skip_tags: 1 }).data).toEqual([
      { label: 'pubky', taggers: [CLEO], taggers_count: 1, tag_uri: null },
    ]);
    const taggers = postTaggers(view, {
      author_id: ALICE,
      post_id: a1.id,
      label: 'Rust ',
      skip: 1,
      limit: 1,
      viewer_id: BRAN,
    });
    expect(taggers.data).toEqual({ users: [DION], tag_uri: buildTag(BRAN, a1Uri, 'rust').url });
    expect(taggers.coverage.kind).toBe('scope');
    expect(postTaggers(view, { author_id: ALICE, post_id: a1.id, label: 'none' }).data).toEqual({
      users: [],
      tag_uri: null,
    });
  });

  it('rejects an empty label and an oversized page', () => {
    expect(() => postTaggers(view, { author_id: ALICE, post_id: a1.id, label: ' ' })).toThrow(InvalidQueryError);
    expect(() => postTaggers(view, { author_id: ALICE, post_id: a1.id, label: 'rust', limit: 101 })).toThrow(
      InvalidQueryError,
    );
  });
});
