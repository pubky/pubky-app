import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';

export type TFeedCreateParams = {
  name: string;
  tags: string[];
  reach: PubkyAppFeedReach;
  sort: PubkyAppFeedSort;
  content: PubkyAppPostKind | null;
  layout: PubkyAppFeedLayout;
};

export type TFeedUpdateParams = {
  changes: Partial<Omit<TFeedCreateParams, 'name'>>;
} & TFeedIdParam;

export type TFeedIdParam = {
  feedId: string;
};
