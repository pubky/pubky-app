import { useEffect, useState } from 'react';
import { SETTINGS_ROUTES } from '@/app/routes';
import { SOCIAL_V1_FEEDS_DIRECTORY } from '@/config/auth';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { publishPubchiSync } from '@/controllers/pubchi/pubchi-sync';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import { CUSTOM_FEED_CONTENT_ALL, type CustomFeedFormData } from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import { PUBCHI_HOMESERVER_DIRECTORY, PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import { feedProposalV2ToCreateParams } from '@/libs/pubchi/feed-map';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas/feed';
import { buildFeedStreamId } from '@/models/feed/feed.helpers';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export function usePubchiFeedBuilder({
  proposal,
  existingFeed,
  onOpenChange,
}: {
  proposal: FeedProposalV2;
  existingFeed?: FeedModelSchema;
  onOpenChange: (open: boolean) => void;
}) {
  const mapped = feedProposalV2ToCreateParams(proposal);
  const owner = useAuthStore((state) => state.currentUserPubky);
  const initialValues: CustomFeedFormData = {
    ...mapped.params,
    reach: mapped.params.reach === 'followers' ? 'all' : mapped.params.reach,
    content: mapped.params.content ?? CUSTOM_FEED_CONTENT_ALL,
  };
  const [draft, setDraft] = useState(initialValues);
  const [preview, setPreview] = useState<{ ids: string[]; error: boolean }>({ ids: [], error: false });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!owner) {
        setPreview({ ids: [], error: true });
        return;
      }
      const feed: FeedModelSchema = {
        id: existingFeed?.id ?? 'pubchi-preview',
        ...draft,
        reach: draft.reach === TAGGED_AS_FILTER_KEY ? 'wot' : draft.reach,
        content: draft.content === CUSTOM_FEED_CONTENT_ALL ? null : draft.content,
        created_at: 0,
        updated_at: 0,
      };
      void (async () => {
        try {
          const streamId = buildFeedStreamId(feed, owner);
          const cached = await StreamPostsController.getLocalStream({ streamId });
          if (!cancelled) setPreview({ ids: (cached?.stream ?? []).slice(0, 5), error: false });
        } catch {
          if (!cancelled) setPreview({ ids: [], error: true });
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, existingFeed?.id, owner]);

  const save = async (data: CustomFeedFormData): Promise<boolean> => {
    if (!mapped.canApply) {
      toast({ variant: 'error', title: 'Choose supported settings before applying the feed.' });
      return false;
    }
    const session = useAuthStore.getState().selectSession();
    const capabilities = session?.info.capabilities ?? [];
    const sessionOwner = session?.info.publicKey?.z32?.();
    const canWriteFeed =
      Boolean(owner) &&
      sessionOwner === owner &&
      sessionCovers(capabilities, SOCIAL_V1_FEEDS_DIRECTORY) &&
      sessionCovers(capabilities, PUBCHI_HOMESERVER_DIRECTORY) &&
      sessionCovers(capabilities, PUBCHI_PRIVATE_DIRECTORY);
    if (!canWriteFeed) {
      toast({
        variant: 'error',
        title: 'Re-approve Pubchi in Ring to record this feed',
        action: {
          label: 'Re-approve',
          altText: 'Re-approve Pubchi in Ring',
          onClick: () => {
            window.location.assign(SETTINGS_ROUTES.PUBCHI);
          },
        },
      });
      return false;
    }
    let feed: FeedModelSchema | null;
    try {
      const changes = {
        ...data,
        reach: data.reach === TAGGED_AS_FILTER_KEY ? 'wot' : data.reach,
        content: data.content === CUSTOM_FEED_CONTENT_ALL ? null : data.content,
      };
      feed = existingFeed
        ? await FeedController.commitUpdate({ feedId: existingFeed.id, changes })
        : await FeedController.commitCreate(changes);
    } catch {
      toast({ variant: 'error', title: "Couldn't save the feed. Try again." });
      return false;
    }
    if (!feed || useAuthStore.getState().currentUserPubky !== owner) return false;
    let provenanceRecorded = true;
    try {
      provenanceRecorded = await PubchiController.commitRecordBuiltFeed({
        proposal,
        feed,
        provenanceFeedId: existingFeed?.id,
      });
    } catch {
      provenanceRecorded = false;
    }
    if (useAuthStore.getState().currentUserPubky !== owner) return false;
    publishPubchiSync(owner!, 'created');
    toast(
      provenanceRecorded
        ? { title: 'Feed applied' }
        : { variant: 'warning', title: "Feed applied, but couldn't save its Pubchi record" },
    );
    onOpenChange(false);
    return true;
  };

  return { mapped, initialValues, preview, save, setDraft };
}
