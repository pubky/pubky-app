import { backupDownloadFilePath } from './common';
import type { SeedCreatePostArgs, SeededCollectionLayout, SeededPost, SeededUser } from './types/seed';

// Spec-side helpers for the seed tasks in cypress/plugins/seed.ts.
//
// They create the users and activity a test only observes (followers, other people's posts,
// notifications to receive) through the homeserver API instead of driving the UI for every
// precondition. Each UI flow they replace keeps its own focused test in the spec that owns it,
// so seeding saves wall-clock time without dropping coverage.
//
// Every helper resolves once the homeserver has accepted the write, without waiting for Nexus, and
// yields what it wrote. A spec seeds a phase, then makes one `waitForNexus` call (nexus.ts) with a
// check for every record the phase's assertions read from Nexus, all polled together.
//
// Nexus indexes a write by reading the record's current state from the homeserver when it gets to
// the event. A record edited or deleted before then is indexed as its final state, and the edit or
// deletion is lost: wait for every record an edit or deletion depends on before writing it.
// Consecutive seed writes are a few milliseconds apart, so records seeded in order also sort in
// that order wherever a surface orders them by time.

/**
 * Signs a new user up on the test homeserver and writes their profile, the API equivalent of UI
 * onboarding (covered by onboarding.cy.ts).
 * With `withRecoveryFile`, also saves their encrypted recovery file where the UI backup would land,
 * so the spec can sign in as them with `cy.signInWithEncryptedFile(backupDownloadFilePath(name))`.
 */
export const seedUserViaApi = (name: string, { bio = '', withRecoveryFile = false } = {}) =>
  cy.task<SeededUser>('seedCreateUser', {
    name,
    bio,
    recoveryFilePath: withRecoveryFile ? backupDownloadFilePath(name) : undefined,
  });

const createPost = (args: SeedCreatePostArgs) => cy.task<SeededPost>('seedCreatePost', args);

/**
 * Publishes a short post as `author` (the composer is covered in posts.cy.ts). `tags` are added by
 * the author right after, as tagging in the composer does.
 */
export const createPostViaApi = (author: SeededUser, content: string, { tags }: { tags?: string[] } = {}) =>
  createPost({ authorId: author.id, content, kind: 'short', tags });

/** Uploads a fixture image and publishes an image post attaching it, as the composer's image upload does. */
export const createImagePostViaApi = (
  author: SeededUser,
  content: string,
  { tags, fixture = 'mustache-you.png' }: { tags?: string[]; fixture?: string } = {},
) =>
  createPost({
    authorId: author.id,
    content,
    kind: 'image',
    imageFixturePath: `${Cypress.config('fixturesFolder')}/${fixture}`,
    tags,
  });

/** Replies to `parent` as `author` (the reply dialogs are covered in posts.cy.ts). */
export const replyViaApi = (author: SeededUser, parent: SeededPost, content: string) =>
  createPost({ authorId: author.id, content, kind: 'short', parentUri: parent.uri });

/** Reposts `original` as `author`, with optional quote `content` (the repost dialog is covered in posts.cy.ts). */
export const repostViaApi = (author: SeededUser, original: SeededPost, content = '') =>
  createPost({ authorId: author.id, content, kind: 'short', embed: { uri: original.uri, kind: original.kind } });

/** The text the @mention autocomplete inserts for `user`; Nexus turns it into a mention of them. */
export const mentionOf = (user: SeededUser) => user.pubky;

/** Rewrites `post` with new `content`, as editing it in the app does. */
export const editPostViaApi = (author: SeededUser, post: SeededPost, content: string) =>
  cy.task<{ id: string }>('seedEditPost', { authorId: author.id, postId: post.id, content });

/** Deletes `post` from the author's homeserver, as deleting it in the app does. */
export const deletePostViaApi = (author: SeededUser, post: SeededPost) =>
  cy.task<{ id: string }>('seedDeletePost', { authorId: author.id, postId: post.id });

// Yields the ids of the tags written, one per label
const tagViaApi = (tagger: SeededUser, uri: string, labels: string[]) => {
  const tagIds: string[] = [];
  labels.forEach((label) => {
    cy.task<{ id: string }>('seedTag', { taggerId: tagger.id, uri, label }).then(({ id }) => {
      tagIds.push(id);
    });
  });
  return cy.wrap(tagIds, { log: false });
};

/** Tags `post` with each label as `tagger` (tagging in the UI is covered in posts.cy.ts). */
export const tagPostViaApi = (tagger: SeededUser, post: SeededPost, labels: string[]) =>
  tagViaApi(tagger, post.uri, labels);

/** Tags `user`'s profile with each label as `tagger` (profile tagging is covered in profile.cy.ts). */
export const tagUserViaApi = (tagger: SeededUser, user: SeededUser, labels: string[]) =>
  tagViaApi(tagger, user.uri, labels);

/** `follower` follows `followee` (following from a profile or a post menu is covered in contacts.cy.ts). */
export const followUserViaApi = (follower: SeededUser, followee: SeededUser) =>
  cy.task<{ id: string }>('seedFollow', { followerId: follower.id, followeeId: followee.id });

/**
 * Creates a collection holding `items` as `author`, shown in `layout` by default (creating one in
 * the UI is covered in collections.cy.ts).
 */
export const createCollectionViaApi = (
  author: SeededUser,
  name: string,
  {
    description = '',
    items = [],
    layout = 'grid',
  }: { description?: string; items?: SeededPost[]; layout?: SeededCollectionLayout } = {},
) =>
  cy.task<SeededPost>('seedCreateCollection', {
    authorId: author.id,
    name,
    description,
    items: items.map((item) => item.uri),
    layout,
  });

/** Adds `post` to `collection`, rewriting the collection post as saving into it in the app does. */
export const addPostToCollectionViaApi = (author: SeededUser, collection: SeededPost, post: SeededPost) =>
  cy.task<{ id: string }>('seedAddToCollection', {
    authorId: author.id,
    collectionId: collection.id,
    itemUri: post.uri,
  });

/** `user` follows `collection`, which the app stores as a bookmark of the collection post. */
export const followCollectionViaApi = (user: SeededUser, collection: SeededPost) =>
  cy.task<{ id: string }>('seedBookmark', { userId: user.id, uri: collection.uri });

/**
 * Moves `user`'s last-read marker to now, so only notifications created afterwards count as unread.
 * Without one, the app's first sign-in creates the marker at sign-in time and would mark as read
 * every notification seeded before it.
 */
export const markNotificationsReadViaApi = (user: SeededUser) =>
  cy.task('seedMarkNotificationsRead', { userId: user.id });
