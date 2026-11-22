'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured, PINAKES_SLOW_READ_MS } from '@/config/pinakes';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { getFirstLinkUrl } from '@/libs/post/postLinkUrl';
import {
  useIsNestedPostPreview,
  useIsPostPreviewNavigable,
} from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import { getLinkHost, getResourceLinks } from '@/molecules/ResourceCard/ResourceCard.utils';
import { hasPostVideo, showsPostFromCard } from '@/molecules/ResourceCard/ResourcePost';
import { useResourceSurface } from '@/molecules/ResourceCard/ResourceSurfaceContext';
import { usePostPreviewImage } from '@/molecules/ResourceCard/usePostPreviewImage';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import {
  getCategoryPlayers,
  getPlayerTarget,
  isPlayable,
  PlayerCategory,
} from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { PlayOnPill, PlayOnPillPlaceholder } from '@/molecules/ResourcePlayer/ResourcePlayerControls';
import { AnimatedHeight } from '@/molecules/ResourcePlayer/ResourcePlayerFrame';
import { useCardPlayer } from '@/molecules/ResourcePlayer/useCardPlayer';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { PostLinkEmbedsProps } from './PostLinkEmbeds.types';
import { parseUrlForLinkEmbed } from './PostLinkEmbeds.utils';
import { useSlowRead } from './Providers/Generic/useSlowRead';
import { getNativeEmbedCard, getShowPostLabel } from './Providers/Native/nativeEmbed.utils';
import { NativeEmbedResource } from './Providers/Native/NativeEmbedResource';
import type { EmbedData, EmbedProvider, EmbedResourceKind } from './Providers/Provider.types';

/**
 * Embeds `url` when given, else the first link of `content`. Only `url`, the link the post embeds, is
 * the post's embed: a generic link there shows as the external resource card. A link that is only in
 * the text keeps its own website preview, since the post does not reference that resource.
 *
 * A post's embed with a platform embed (`resourceKind`: an X post, a YouTube or Vimeo video) shows
 * as that resource too (`NativeEmbedResource`), also in the composer and in a quoted post (only
 * another Pubky post is suppressed there). Without Pinakes, the plain embed. A YouTube or Vimeo link
 * whose player the viewer removed from Players shows as any link does (the resource card, or the
 * link's own preview). With platform embeds up front off (the default), a platform embed that is not
 * shown as a resource (a link only in the text, or no Pinakes) shows the link's Pinakes card when
 * there is one, the player inside it, else waits for its Play on / Show on (`EmbedOnPress`).
 */
export const PostLinkEmbeds = ({ content = '', url, isComposing = false }: PostLinkEmbedsProps) => {
  const isNested = useIsNestedPostPreview();
  const media = useSettingsStore((state) => state.media);
  // YouTube and Vimeo, the only platform embeds with a player here, follow Video's Players.
  const { hiddenPlayers } = getCategoryPlayers(media, PlayerCategory.VIDEO);
  const { embed, provider } = useMemo(
    // Without Pinakes, Links & Media is hidden, so a removed player could not be put back.
    () => parseUrlForLinkEmbed(url || getFirstLinkUrl(content), !isNested, isPinakesConfigured() ? hiddenPlayers : []),
    [content, url, isNested, hiddenPlayers],
  );
  const mediaContainerRef = usePauseMediaOutsideViewport();

  if (!embed || !provider) return null;

  const isPostEmbed = Boolean(url);
  const resourceKind = url && isPinakesConfigured() ? provider.resourceKind : undefined;

  return (
    <Container ref={mediaContainerRef} className="w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {url && resourceKind ? (
        <PlatformEmbedResource
          // A new link starts over (a failed or played embed belongs to the old one).
          key={url}
          url={url}
          embed={embed}
          provider={provider}
          kind={resourceKind}
          isComposing={isComposing}
        />
      ) : provider.resourceKind && !media.embedsUpFront ? (
        <EmbedOnPress
          key={url || getFirstLinkUrl(content)}
          link={url || getFirstLinkUrl(content) || ''}
          kind={provider.resourceKind}
          isComposing={isComposing}
          renderEmbed={() => provider.renderEmbed(embed, { isComposing, isPostEmbed, autoplay: true })}
        />
      ) : (
        provider.renderEmbed(embed, { isComposing, isPostEmbed })
      )}
    </Container>
  );
};

/**
 * A link with a platform embed (`resourceKind`) as that resource (`NativeEmbedResource`), the
 * platform's embed filling its frame: a post's embed, and an external resource's item in a list of
 * resources (`ResourceItem`), so both choose embed or card the same way.
 */
export function PlatformEmbedResource({
  url,
  embed,
  provider,
  kind,
  isComposing,
}: {
  url: string;
  embed: EmbedData;
  provider: EmbedProvider;
  kind: EmbedResourceKind;
  isComposing?: boolean;
}) {
  return (
    <NativeEmbedResource
      url={url}
      kind={kind}
      isComposing={isComposing}
      renderEmbed={({ onError, autoplay }) =>
        provider.renderEmbed(embed, { isPostEmbed: true, onEmbedError: onError, fill: true, autoplay })
      }
    />
  );
}

interface EmbedOnPressProps {
  link: string;
  kind: EmbedResourceKind;
  /** The composer's preview: a card's player shows paused there, never docks. */
  isComposing?: boolean;
  renderEmbed: () => ReactNode;
}

/**
 * A platform's embed (an X post, a YouTube or Vimeo video) that is not shown as a resource, with
 * platform embeds up front off. Once the box first comes near the screen (at once in the composer),
 * the link's Pinakes card is read (read-only, re-read while on screen; never asked to read the link),
 * the card's skeleton holding the place for at most `PINAKES_SLOW_READ_MS`. With a card
 * (`EmbedOnPressCard`): the card as a post's embed shows it, with no footer of its own (the link is the
 * post's text, not its resource), its player or the post's embed loading inside it on a press.
 * Without one (Pinakes unset, no card, a failed or slow read): only the card player's pill (Play on
 * <site> / Show on <site>), the platform's embed under it once pressed. Nothing loads from the
 * platform before the press.
 */
function EmbedOnPress(props: EmbedOnPressProps) {
  // The default margin: the box counts as near 200px before it scrolls in.
  const { ref, isVisible } = useViewportObserver();
  const [wasNear, setWasNear] = useState(false);
  if (isVisible && !wasNear) setWasNear(true);
  if (!isPinakesConfigured()) return <EmbedPill {...props} />;
  // The composer reads its preview at once and once (no re-reads); elsewhere the read waits for the box.
  const choice =
    props.isComposing || wasNear ? (
      <EmbedOnPressChoice {...props} isOnScreen={!props.isComposing && isVisible} />
    ) : (
      <ResourceCardSkeleton />
    );
  return (
    <Container overrideDefaults ref={ref} className="min-w-0" data-testid="embed-on-press-resource">
      {/* The composer measures and snaps its own height; elsewhere the box grows smoothly. */}
      {props.isComposing ? choice : <AnimatedHeight>{choice}</AnimatedHeight>}
    </Container>
  );
}

function EmbedOnPressChoice({ isOnScreen, ...props }: EmbedOnPressProps & { isOnScreen: boolean }) {
  const { data, isLoading } = usePinakesCard(props.link, { recheck: isOnScreen });
  const isSlow = useSlowRead(props.link, isLoading, PINAKES_SLOW_READ_MS);
  // The pill opened before a card was read: a card read later keeps the embed that plays.
  const [openedWithoutCard, setOpenedWithoutCard] = useState(false);
  if (isLoading && !isSlow) return <ResourceCardSkeleton />;
  const card = getNativeEmbedCard(data);
  if (!card || openedWithoutCard) return <EmbedPill {...props} onOpen={setOpenedWithoutCard} />;
  return <EmbedOnPressCard {...props} card={card} />;
}

/**
 * A text link's card (`EmbedOnPress`): a video the card player plays (`isPlayable`) has its switch
 * and Play in the header (`useCardPlayer`), its player loading inside the card; an X post the card
 * tells from its own data shows as a post at once (`ResourcePost`); any other X post, or a video
 * it cannot play, has the pill (Show on <site> / Play on <site>) there, the platform's embed loading
 * inside the card. The card stays; the pill closes what it opened.
 */
function EmbedOnPressCard({
  link,
  kind,
  isComposing = false,
  renderEmbed,
  card,
}: EmbedOnPressProps & { card: TPinakesResourceDetail }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigable = useIsPostPreviewNavigable();
  const surface = useResourceSurface() === 'card' ? 'default' : undefined;
  const isVideo = kind === 'video';
  // An X post shows its video by its link preview's still (`hasPostVideo`): read as the card reads it.
  const postPreview = usePostPreviewImage(card, kind === 'post');
  const player = useCardPlayer(isVideo && isPlayable(card, link) ? card : null, link, surface, {
    preview: isComposing || !navigable,
    previewImage: postPreview.image,
  });
  // A post the card tells from its own data shows at once, as a post: nothing to press, nothing from
  // its site. While its link preview, which may name a video, is read, the pill's place is held.
  const isPostFromCard = kind === 'post' && showsPostFromCard(card, postPreview.image);
  const pill =
    player.switcher || isPostFromCard ? undefined : (
      <PlayOnPill
        uri={link}
        isOpen={isOpen}
        label={getShowPostLabel(
          getResourceLinks(card, link).siteName,
          isOpen,
          isVideo || hasPostVideo(card, postPreview.image),
        )}
        aria-expanded={isOpen}
        surface={surface}
        onClick={() => setIsOpen(!isOpen)}
        data-testid="show-embed"
      />
    );
  const placeholder =
    // Only where the pill could come: not beside a card player's own controls.
    isPostFromCard && postPreview.pending && !player.switcher ? (
      <PlayOnPillPlaceholder uri={link} surface={surface} />
    ) : undefined;
  const embed =
    pill && isOpen ? (
      <Container overrideDefaults className="min-w-0" data-testid="native-embed-body">
        {renderEmbed()}
      </Container>
    ) : undefined;
  return (
    <ResourceCard
      card={card}
      href={link}
      headerControl={player.switcher ?? pill ?? placeholder}
      player={player.player ?? embed}
      // A post shows from the card's data, text and image at once; a video in it keeps its press.
      asPost
    />
  );
}

/**
 * A platform's embed with no card to show it on: only the card player's pill (Play on <site> / Show
 * on <site>, as on a resource's card) until it is pressed, then the platform's embed under it, a
 * video started by that press; the pill closes it again. Nothing loads from the platform before the
 * press.
 */
function EmbedPill({
  link,
  kind,
  renderEmbed,
  onOpen,
}: EmbedOnPressProps & {
  /** Told when the pill opens or closes the embed. */
  onOpen?: (isOpen: boolean) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const siteName = getPlayerTarget(link)?.name ?? getLinkHost(link);
  return (
    <Container overrideDefaults className="flex min-w-0 flex-col gap-3" data-testid="embed-on-press">
      <PlayOnPill
        uri={link}
        isOpen={isOpen}
        label={getShowPostLabel(siteName, isOpen, kind === 'video')}
        aria-expanded={isOpen}
        className="self-start"
        onClick={() => {
          setIsOpen(!isOpen);
          onOpen?.(!isOpen);
        }}
        data-testid="show-embed"
      />
      {isOpen && renderEmbed()}
    </Container>
  );
}
