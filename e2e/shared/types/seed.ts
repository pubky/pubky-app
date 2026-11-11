// Shapes shared by the seed tasks (e2e/shared/seed.ts) and the Cypress spec-side helpers
// (cypress/support/seed.ts). Everything here crosses `cy.task`, so it stays plain JSON.

export type SeededPostKind = 'short' | 'long' | 'image' | 'collection';

export type SeededUser = {
  // z32 public key, as Nexus and app routes use it
  id: string;
  // `pubky<id>`, the form the search bar and the onboarding copy button use
  pubky: string;
  // profile.json URI, the target of a profile tag
  uri: string;
  name: string;
};

export type SeededPost = {
  id: string;
  authorId: string;
  uri: string;
  kind: SeededPostKind;
};

export type SeedCreateUserArgs = { name: string; bio: string; recoveryFilePath?: string };

export type SeedCreatePostArgs = {
  authorId: string;
  content: string;
  kind: SeededPostKind;
  parentUri?: string;
  embed?: { uri: string; kind: SeededPostKind };
  imageFixturePath?: string;
  tags?: string[];
};

export type SeedEditPostArgs = { authorId: string; postId: string; content: string };
export type SeedDeletePostArgs = { authorId: string; postId: string };
export type SeedTagArgs = { taggerId: string; uri: string; label: string };
export type SeedFollowArgs = { followerId: string; followeeId: string };
export type SeedBookmarkArgs = { userId: string; uri: string };
export type SeedMarkNotificationsReadArgs = { userId: string };
export type SeededCollectionLayout = 'grid' | 'list';

export type SeedCreateCollectionArgs = {
  authorId: string;
  name: string;
  description: string;
  items: string[];
  layout: SeededCollectionLayout;
};
export type SeedAddToCollectionArgs = { authorId: string; collectionId: string; itemUri: string };

export type SeedCreateLockPostArgs = {
  authorId: string;
  title: string;
  teaser: string;
  // Text of the short post behind the lock
  lockedContent: string;
  // Price in sats
  amount: string;
};

export type SeededLockPost = SeededPost & {
  lockId: string;
  // Path tail under /priv/app.locks/content/, as a guarded read names it
  guardedPath: string;
  // The locked post's JSON, base64, for the Lock Server stub to serve
  guardedBytes: string;
};
