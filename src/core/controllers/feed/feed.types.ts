import type { KnownFeedLayout, KnownFeedReach, KnownFeedSort, KnownPostKind } from 'pubky-social-specs';

export type TFeedCreateParams = {
  name: string;
  icon: string;
  tags: string[];
  domain_tags: string[];
  reach: KnownFeedReach;
  sort: KnownFeedSort;
  content: KnownPostKind | null;
  layout: KnownFeedLayout;
};

export type TFeedUpdateParams = {
  changes: Partial<TFeedCreateParams>;
} & TFeedIdParam;

export type TFeedIdParam = {
  feedId: string;
};
