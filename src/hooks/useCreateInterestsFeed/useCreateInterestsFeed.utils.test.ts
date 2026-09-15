import { iconNames } from 'lucide-react/dynamic.js';
import { PubkyAppFeedReach } from 'pubky-app-specs';
import validationLimits from 'pubky-app-specs/validationLimits.json';
import { describe, expect, it } from 'vitest';
import { INTERESTS_FEED_ICON, INTERESTS_FEED_NAME } from '@/config/feed';
import { STARTER_PACK_MAX_TAGS } from '@/config/nexus';
import { customFeedFormDefaults } from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import { buildInterestsFeedParams } from './useCreateInterestsFeed.utils';

describe('buildInterestsFeedParams', () => {
  it('uses the Interests name and icon with the chosen tags as post tags', () => {
    const params = buildInterestsFeedParams(['bitcoin', 'privacy']);

    expect(params.name).toBe(INTERESTS_FEED_NAME);
    expect(params.icon).toBe(INTERESTS_FEED_ICON);
    expect(params.tags).toEqual(['bitcoin', 'privacy']);
    expect(params.domain_tags).toEqual([]);
    expect(params.content).toBeNull();
  });

  it('keeps the reach at the create-dialog default', () => {
    // Reach is the one default typed out by hand (the form type carries the Tagged-as sentinel),
    // so pin it to the dialog default explicitly; sort and layout are read from it directly.
    expect(buildInterestsFeedParams(['bitcoin']).reach).toBe(PubkyAppFeedReach.All);
    expect(customFeedFormDefaults.reach).toBe(PubkyAppFeedReach.All);
  });

  it('uses an icon that exists in the Lucide catalog', () => {
    expect(iconNames).toContain(INTERESTS_FEED_ICON);
  });

  it('fits every onboarding interest selection within the custom feed tag limit', () => {
    // The onboarding step caps the selection at STARTER_PACK_MAX_TAGS (a Nexus contract) and
    // specs caps a feed's tags independently; the whole selection must always fit the feed.
    expect(STARTER_PACK_MAX_TAGS).toBeLessThanOrEqual(validationLimits.feedTagsMaxCount);
  });
});
