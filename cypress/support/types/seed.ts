// Shapes shared by the Node seed tasks (cypress/plugins/seed.ts) and the spec-side helpers
// (cypress/support/seed.ts). Everything here crosses `cy.task`, so it stays plain JSON.

export type SeededPostKind = 'note' | 'image' | 'article' | 'collection';

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

export type SeedCreateUserArgs = { name: string; bio: string; recoveryFilePath?: string; legacy?: boolean };

export type SeedCreatePostArgs = {
  authorId: string;
  content: string;
  kind: SeededPostKind;
  // An article's title; its `content` is the body and its image the cover
  title?: string;
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
export type SeedMuteArgs = { userId: string; muteeId: string };
export type SeedMarkNotificationsReadArgs = { userId: string };
export type SeedSettingsArgs = { userId: string; settings: Record<string, unknown> };
// A directory of the owner's tree, as `SessionStorage.list` takes it
export type HomeserverDirectory = `/pub/${string}/` | `/priv/${string}/`;
export type SeedListPathsArgs = { userId: string; prefix: HomeserverDirectory };

/** The amount and asset a lock asks for; the recipient is always the lock's creator. */
export type SeededLockPrice = { amount: string; asset: 'BTC' | 'USD' };

/** The public teaser envelope a lock announcement stores in its `content` (`docs/locks.md`, Data shape). */
export type SeededLockTeaser = { lock_title: string; teaser_description: string; content_kind?: string };

export type SeedLegacyLockArgs = {
  authorId: string;
  /** The text of the locked post; it is an image post, with `imageFixturePath` as its one attachment. */
  lockedText: string;
  teaser: SeededLockTeaser;
  price: SeededLockPrice;
  imageFixturePath: string;
};

/** A lock a 0.x client published: its announcement, the public lock file and what the Lock Server guarded. */
export type SeededLegacyLock = {
  post: SeededPost;
  lockId: string;
  /** `pubky://<owner>/pub/app.locks/<lockId>.json`, the announcement's top-level `lock`. */
  lockUrl: string;
  /** The guarded bytes (base64) by path tail, as the stand-in Lock Server keeps them (`TLockServerState.guarded`). */
  guarded: Record<string, string>;
};
export type SeededCollectionLayout = 'grid' | 'list';

export type SeedCreateCollectionArgs = {
  authorId: string;
  name: string;
  description: string;
  items: string[];
  layout: SeededCollectionLayout;
};
