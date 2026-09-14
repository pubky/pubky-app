import { PubkyAppFeedReach } from 'pubky-app-specs';
import { INTERESTS_FEED_ICON, INTERESTS_FEED_NAME } from '@/config/feed';
import type { TFeedCreateParams } from '@/controllers/feed/feed.types';
import { customFeedFormDefaults } from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';

/**
 * Create params for the onboarding "Interests" feed: the chosen interest tags as post tags and
 * every other setting at the create-dialog default (`customFeedFormDefaults`). Reach is the only
 * default not read from the form: the form's reach type also carries the Tagged-as UI sentinel,
 * and the "no content filter" sentinel is stored as `null`.
 */
export function buildInterestsFeedParams(tags: string[]): TFeedCreateParams {
  return {
    name: INTERESTS_FEED_NAME,
    icon: INTERESTS_FEED_ICON,
    tags,
    domain_tags: [],
    reach: PubkyAppFeedReach.All,
    sort: customFeedFormDefaults.sort,
    content: null,
    layout: customFeedFormDefaults.layout,
  };
}
