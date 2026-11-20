'use client';

import { type ReactNode, useId, useState } from 'react';
import { MessageCircle, Tag } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import type { TMergedTag } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useResourceCounts } from '@/hooks/useResourceCounts/useResourceCounts';
import { useResourceTags } from '@/hooks/useResourceTags/useResourceTags';
import { isExternalParentUri } from '@/libs/post/externalParent';
import { cn } from '@/libs/utils/utils';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { DialogReply } from '@/organisms/DialogReply/DialogReply';
import { PostActionButton } from '@/organisms/PostActionsBar/PostActionButton';
import { type ResourceExtraMenuContent, ResourceMoreMenu } from './ResourceMoreMenu';
import { ResourcePostButton } from './ResourcePostButton';
import { ResourceSavePicker } from './ResourceSavePicker';
import { ResourceTagBar } from './ResourceTagBar';

const REPLY_LABEL = 'Reply to this external resource';
const CANNOT_REPLY_LABEL = 'Replies to this external resource are not supported';

interface ResourceActionsProps {
  /** The external resource's link exactly as written: what is bookmarked, collected and tagged. */
  uri: string;
  /**
   * The web link "Post about this" puts in the composer, when `uri` is not one; `null` when the
   * resource has none (the button is disabled). Defaults to `uri`.
   */
  postUri?: string | null;
  /** How many public collections hold the link (Pinakes), when Nexus does not count them. */
  collectionsCount?: number | null;
  /** The page thread's reply count (`useResourceReplies`); else Nexus' count read with the tags. */
  replyCount?: number;
  /** Called with a reply's id once the Reply dialog wrote it: the page's thread shows it at once. */
  onReplySubmitted?: (replyId: string) => void;
  /** Names what is tagged ("Tags on this video"): the tag list's name and the Tags button's tooltip. */
  tagsLabel: string;
  /** The link's web address (`getResourceLinks().linkUrl`) for the ⋯ menu; `null` for a non-web URI. */
  linkUrl?: string | null;
  /** The card's title for the ⋯ menu's "Copy title"; absent when the card has none. */
  title?: string | null;
  /** Extra ⋯ menu entries after the card's own (the other services it is on, "Also on"). */
  extraMenuContent?: ResourceExtraMenuContent;
  /** Whether the card is on screen: the tags are read from the first time it is. */
  isOnScreen?: boolean;
  /** The resource page's tags on the same thing's other links (`mergeOtherLinkTags`), in the tag list. */
  otherTagList?: readonly TMergedTag[];
  /**
   * "Play on <service>" for a card with a service's player (`useCardPlayer`): on its own line above
   * the footer, so the footer's tags and buttons are the post's, never squeezed by it.
   */
  playOn?: ReactNode;
  /** `large`: under the resource page's large card, with its padding and the post's pills. */
  size?: 'default' | 'large';
}

/**
 * What closes an external resource card, in a post or atop its page: the post's own footer. The tags
 * and "+" on the left; on the right, in the post's order and in its buttons: Tags, Reply (a post
 * whose `parent` is the resource's URI), Post about this, Save and ⋯; a card with a player has
 * "Play on <service>" (`playOn`) on a line above. Like the post's, the tags show only a few until
 * expanded; on a phone the buttons go under the tags. The pills are the post's own on the post
 * card's surface (the large card, `ResourceSurfaceProvider` `card`: a collection's item, a card in a
 * quoted post), else `surface="muted"` (`bg-card` pills) on a card inside a post.
 *
 * Counts show as a post's do, 0 included: the tag labels Nexus returned (`20+` at the read limit),
 * the replies and embeds Nexus counts (read with the tags), the public collections, else Pinakes'
 * count. No number while they are read or when the configured Nexus does not serve that count.
 *
 * On the resource page, the tags on the same thing's other links join the tag list (`otherTagList`).
 *
 * The zone is all controls, so a click on it never counts as a click through the card.
 */
export function ResourceActions({
  uri,
  postUri = uri,
  collectionsCount,
  tagsLabel,
  linkUrl = null,
  title,
  extraMenuContent,
  isOnScreen = true,
  otherTagList,
  playOn,
  size = 'default',
  replyCount,
  onReplySubmitted,
}: ResourceActionsProps) {
  const { requireAuth } = useRequireAuth();
  // Once read, the tags stay while the card scrolls out of view.
  const [hasBeenOnScreen, setHasBeenOnScreen] = useState(isOnScreen);
  if (isOnScreen && !hasBeenOnScreen) setHasBeenOnScreen(true);
  const resourceTags = useResourceTags(uri, { enabled: hasBeenOnScreen });
  // Read with the tags (one answer): no request of its own.
  const counts = useResourceCounts(uri);
  // 0 for a link Nexus has no record of; no number while read or for a count Nexus does not serve.
  const countOf = (key: 'replies' | 'embeds') => (counts === null ? 0 : counts?.[key]);
  const replies = replyCount ?? countOf('replies');
  const embeds = countOf('embeds');
  const collections = counts?.collections ?? collectionsCount;
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const tagsId = useId();
  const tagCount = resourceTags.isLoading || resourceTags.isError ? undefined : resourceTags.tags.length;
  const tagCountText = tagCount === undefined ? undefined : `${tagCount}${resourceTags.isAtReadLimit ? '+' : ''}`;
  const tagsButtonLabel = tagCountText === undefined ? tagsLabel : `${tagsLabel} (${tagCountText})`;
  const isLarge = size === 'large';
  const onCard = useResourceSurface() === 'card';
  const surface = isLarge || onCard ? 'default' : 'muted';
  // A reply's `parent` must be a URI the app writes (a web link or a known identifier scheme).
  const canReply = isExternalParentUri(uri);
  const replyLabel = canReply ? REPLY_LABEL : CANNOT_REPLY_LABEL;

  return (
    <Container
      overrideDefaults
      data-resource-controls
      data-testid="resource-actions"
      data-size={size}
      className={cn('@container/resource-actions flex min-w-0 flex-col gap-3', isLarge ? 'px-6 py-4' : 'px-4 py-3')}
    >
      {playOn && (
        <Container overrideDefaults data-testid="resource-player-row" className="flex">
          {playOn}
        </Container>
      )}
      {/*
        The post footer's layout (`PostInlineTagsActions`), also staying stacked in a narrow grid cell.
        Beside the expanded tags the buttons sit at the bottom, as beside the post's tags panel.
      */}
      <Container
        overrideDefaults
        data-testid="resource-footer"
        className={cn(
          'flex min-w-0 flex-col items-start gap-3 md:flex-row md:justify-between md:gap-4',
          '@max-xl/grid:flex-col! @max-xl/grid:items-start! @max-xl/grid:gap-3!',
          isTagsExpanded ? 'md:items-end' : 'md:items-start',
        )}
      >
        <ResourceTagBar
          resourceTags={resourceTags}
          label={tagsLabel}
          id={tagsId}
          isExpanded={isTagsExpanded}
          isAdding={isAddingTag}
          onAddingChange={setIsAddingTag}
          uri={uri}
          otherTags={otherTagList}
        />
        {/*
          The post's action row (`PostActionsBar`'s classes). Beside the tags (from md) it keeps its
          width and one row, the tags wrap instead; stacked in a narrow grid cell it may wrap again.
        */}
        <Container
          overrideDefaults
          data-testid="resource-action-row"
          className={cn(
            'flex flex-wrap gap-2 md:shrink-0 md:flex-nowrap @max-xl/grid:flex-wrap!',
            // On a narrow card (a phone, a quoted post) the buttons close up, so ⋯ stays on their row. A card in a
            // post on a phone (the body is at least 375 px wide) gets the 2xs step, with room for counts.
            '@max-sm/resource-actions:gap-1.5 @max-sm/resource-actions:[&>*]:px-2.5!',
            '@max-2xs/resource-actions:gap-1 @max-2xs/resource-actions:[&>*]:gap-1! @max-2xs/resource-actions:[&>*]:px-2!',
            '@max-[14.5rem]/resource-actions:[&>*]:px-1.5!',
            '@max-[13.75rem]/resource-actions:gap-0.5',
            '@max-[13.5rem]/resource-actions:[&>*]:gap-0.5! @max-[13.5rem]/resource-actions:[&>*]:px-1!',
          )}
        >
          <PostActionButton
            icon={Tag}
            surface={surface}
            count={tagCountText}
            ariaLabel={tagsButtonLabel}
            title={tagsButtonLabel}
            aria-expanded={isTagsExpanded}
            aria-controls={tagsId}
            // Like the post's Tags button: showing the tags is a read, the input asks to sign in itself.
            onClick={() => {
              setIsTagsExpanded((isExpanded) => !isExpanded);
              setIsAddingTag(false);
            }}
            data-testid="resource-tags-button"
          />
          <PostActionButton
            icon={MessageCircle}
            surface={surface}
            count={canReply ? replies : undefined}
            ariaLabel={
              canReply && replies !== undefined
                ? `${replyLabel} (${replies} ${replies === 1 ? 'reply' : 'replies'})`
                : replyLabel
            }
            title={replyLabel}
            disabled={!canReply}
            onClick={() => requireAuth(() => setIsReplying(true))}
            data-testid="resource-reply-button"
          />
          <ResourcePostButton uri={postUri} count={embeds} surface={surface} />
          <ResourceSavePicker uri={uri} collectionsCount={collections} surface={surface} />
          <ResourceMoreMenu
            uri={uri}
            linkUrl={linkUrl}
            title={title}
            extraMenuContent={extraMenuContent}
            surface={surface}
          />
        </Container>
      </Container>
      {isReplying && (
        <DialogReply
          resourceUri={uri}
          open={isReplying}
          onOpenChangeAction={setIsReplying}
          onReplySubmitted={onReplySubmitted}
        />
      )}
    </Container>
  );
}
