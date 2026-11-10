'use client';

import { useMemo } from 'react';
import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured } from '@/config/pinakes';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { getFirstLinkUrl } from '@/libs/post/postLinkUrl';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { PostLinkEmbedsProps } from './PostLinkEmbeds.types';
import { parseUrlForLinkEmbed } from './PostLinkEmbeds.utils';
import { NativeEmbedResource } from './Providers/Native/NativeEmbedResource';

/**
 * Embeds `url` when given, else the first link of `content`. Only `url`, the link the post embeds, is
 * the post's embed: a generic link there shows as the external resource card. A link that is only in
 * the text keeps its own website preview, since the post does not reference that resource.
 *
 * A post's embed with a platform embed (`resourceKind`: an X post, a YouTube or Vimeo video) shows
 * as that resource too (`NativeEmbedResource`), also in the composer. A quoted post, or an app
 * without Pinakes, shows the plain embed. A YouTube or Vimeo link whose player the viewer removed
 * from Players shows as any link does (the resource card, or the link's own preview).
 */
export const PostLinkEmbeds = ({ content = '', url, isComposing = false }: PostLinkEmbedsProps) => {
  const isNested = useIsNestedPostPreview();
  const hiddenPlayers = useSettingsStore((state) => state.media.hiddenPlayers);
  const { embed, provider } = useMemo(
    // Without Pinakes, Links & Media is hidden, so a removed player could not be put back.
    () => parseUrlForLinkEmbed(url || getFirstLinkUrl(content), !isNested, isPinakesConfigured() ? hiddenPlayers : []),
    [content, url, isNested, hiddenPlayers],
  );
  const mediaContainerRef = usePauseMediaOutsideViewport();

  if (!embed || !provider) return null;

  const isPostEmbed = Boolean(url);
  const resourceKind = url && !isNested && isPinakesConfigured() ? provider.resourceKind : undefined;

  return (
    <Container ref={mediaContainerRef} className="w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {url && resourceKind ? (
        <NativeEmbedResource
          // A new link starts over (a failed or played embed belongs to the old one).
          key={url}
          url={url}
          kind={resourceKind}
          isComposing={isComposing}
          renderEmbed={({ onError }) => provider.renderEmbed(embed, { isPostEmbed, onEmbedError: onError, fill: true })}
        />
      ) : (
        provider.renderEmbed(embed, { isComposing, isPostEmbed })
      )}
    </Container>
  );
};
