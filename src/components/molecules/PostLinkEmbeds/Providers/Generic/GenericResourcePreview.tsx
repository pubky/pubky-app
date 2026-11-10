'use client';

import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured } from '@/config/pinakes';
import { usePinakesCard } from '@/hooks/usePinakesCard/usePinakesCard';
import { useViewportObserver } from '@/hooks/useViewportObserver/useViewportObserver';
import { fileNameFromUrl, inferMediaKindFromUrl } from '@/libs/file/inlineMediaKind';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { ResourceCard } from '@/molecules/ResourceCard/ResourceCard';
import {
  getHttpUrl,
  getResourceLinks,
  getResourceStatus,
  getResourceTagsLabel,
} from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceLinkCard } from '@/molecules/ResourceCard/ResourceLinkCard';
import { ResourceCardSkeleton } from '@/molecules/ResourceCardSkeleton/ResourceCardSkeleton';
import { ResourceActions } from '@/organisms/ResourceActions/ResourceActions';
import { PinakesStatus, type TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { GenericPreview } from './GenericPreview';

const IMAGE_FILE_EXTENSION = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

/**
 * A link straight to an image, video or audio file: `GenericPreview` shows or plays it inline, which
 * a card would replace, so such a link is not looked up in Pinakes. The media helpers read `https:`
 * links only, so an `http:` link (also what a link written without a scheme becomes) is read as its
 * `https:` form: only its file extension matters here.
 */
function isDirectMediaFile(url: string): boolean {
  const fileUrl = url.replace(/^http:/i, 'https:');
  const kind = inferMediaKindFromUrl(fileUrl);
  if (kind === 'video' || kind === 'audio') return true;
  const fileName = fileNameFromUrl(fileUrl);
  return fileName !== null && IMAGE_FILE_EXTENSION.test(fileName);
}

/**
 * A card with neither details nor a name says less than the link's own preview: a `pending` or
 * `error` card without a name shows the link's preview instead. A `missing` or `unreachable` card
 * is still shown, since it tells the viewer something about the link.
 */
function hasNothingToShow(card: TPinakesResourceDetail): boolean {
  const status = getResourceStatus(card.status);
  return !card.name && (status === PinakesStatus.PENDING || status === PinakesStatus.ERROR);
}

interface GenericResourcePreviewProps {
  url: string;
  /** The composer's preview: the card without its action row and tag bar. */
  isComposing?: boolean;
}

/**
 * The preview of the generic link a post embeds, as an external resource inside the post (a link that
 * is only in the post's text keeps `GenericPreview`, see `Generic.renderEmbed`): its Pinakes card when Pinakes
 * has one, else the link's own preview in the same frame (`ResourceLinkCard`), both closed by the
 * post's own footer (`ResourceActions`: tags, actions and a ⋯ menu that copies the link and the
 * title), which reads the link's tags once the card is first on screen. A card that is pending or
 * failed and has no name says less than the link's own preview, and a failed read is treated like
 * an unknown link (no error box in a feed).
 *
 * Inside a quoted or reposted post (`PostPreviewCard`) the card has no action row or tag bar, as
 * while composing: that post is itself a link (or sits in the Reply/Repost dialog), so controls
 * there would nest in it. People act on the link where its own post renders.
 *
 * Without a Pinakes origin configured no request is made and the plain `GenericPreview` renders;
 * a direct media file keeps it too, since it shows or plays the file inline.
 *
 * A link Pinakes does not know yet (a post published seconds ago) is read again while the preview
 * is on screen (`usePinakesCard`'s `recheck`), and its card replaces the link's own preview in the
 * same box once Pinakes has read it, with no loading state in between. In the composer, Pinakes is
 * asked to read such a link right away (`resolve`) instead of re-reading it, so the published post
 * shows its card at once, and still has its own re-reads if Pinakes had not read it yet.
 */
export function GenericResourcePreview(props: GenericResourcePreviewProps) {
  const { ref, isVisible } = useViewportObserver({ rootMargin: '0px' });
  return (
    <Container overrideDefaults ref={ref} className="min-w-0" data-testid="resource-preview">
      <ResourcePreview {...props} isOnScreen={isVisible} />
    </Container>
  );
}

function ResourcePreview({
  url,
  isComposing = false,
  isOnScreen,
}: GenericResourcePreviewProps & { isOnScreen: boolean }) {
  const isNested = useIsNestedPostPreview();
  const lookupUrl = isPinakesConfigured() && !isDirectMediaFile(url) ? url : null;
  // The composer has Pinakes read the link (`resolve`) and never re-reads it: a link's re-reads are
  // once per page load, kept for the post once it is published.
  const { data: card, isLoading } = usePinakesCard(lookupUrl, {
    recheck: isOnScreen && !isComposing,
    resolve: isComposing,
  });
  const withActions = !isComposing && !isNested;

  if (!lookupUrl) return <GenericPreview url={url} />;
  if (isLoading) return <ResourceCardSkeleton withActions={withActions} />;

  const shownCard = card && !hasNothingToShow(card) ? card : null;
  // The ⋯ menu copies what the card links.
  const linkUrl = shownCard ? getResourceLinks(shownCard, url).linkUrl : getHttpUrl(url);
  const actions = !withActions ? null : (
    <ResourceActions
      uri={url}
      collectionsCount={card?.collections}
      tagsLabel={getResourceTagsLabel(card)}
      linkUrl={linkUrl}
      title={shownCard?.name}
      isOnScreen={isOnScreen}
    />
  );
  if (!shownCard) return <ResourceLinkCard url={url} actions={actions} />;
  return <ResourceCard card={shownCard} href={url} actions={actions} />;
}
