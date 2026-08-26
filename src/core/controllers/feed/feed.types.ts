import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';

export type TFeedCreateParams = {
  name: string;
  icon: string;
  tags: string[];
  domain_tags: string[];
  reach: PubkyAppFeedReach;
  sort: PubkyAppFeedSort;
  content: PubkyAppPostKind | null;
  layout: PubkyAppFeedLayout;
};

export type TFeedUpdateParams = {
  changes: Partial<TFeedCreateParams>;
} & TFeedIdParam;

export type TFeedIdParam = {
  feedId: string;
};
