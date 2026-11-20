import type {
  KnownFeedLayout,
  KnownFeedReach,
  KnownFeedSort,
  KnownFeedTarget,
  KnownPostKind,
} from 'pubky-social-specs';
import type { TFeedResourceFilters } from '@/models/feed/feed.schema';

export type TFeedCreateParams = {
  name: string;
  icon: string;
  tags: string[];
  domain_tags: string[];
  reach: KnownFeedReach;
  sort: KnownFeedSort;
  content: KnownPostKind | null;
  layout: KnownFeedLayout;
  /** `resources` for a feed of external resources (schema.org types instead of a post kind, no profile tags); absent for posts. */
  target?: KnownFeedTarget;
  /** The schema.org types a feed of external resources lists (up to 10); null or absent for every type. */
  resource_types?: string[] | null;
  /** A feed of external resources' saved search filters (`TFeedResourceFilters`); null or absent for none. */
  resource_filters?: TFeedResourceFilters | null;
};

export type TFeedUpdateParams = {
  changes: Partial<TFeedCreateParams>;
} & TFeedIdParam;

export type TFeedIdParam = {
  feedId: string;
};
