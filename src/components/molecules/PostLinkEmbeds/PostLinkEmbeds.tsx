'use client';

import { useMemo } from 'react';
import { Container } from '@/atoms/Container/Container';
import { isPinakesConfigured } from '@/config/pinakes';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { getFirstLinkUrl } from '@/libs/post/postLinkUrl';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { getCategoryPlayers, PlayerCategory } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { useSettingsStore } from '@/stores/settings/settings.store';
import type { PostLinkEmbedsProps } from './PostLinkEmbeds.types';
import { parseUrlForLinkEmbed } from './PostLinkEmbeds.utils';
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
 * link's own preview).
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
      renderEmbed={({ onError }) =>
        provider.renderEmbed(embed, { isPostEmbed: true, onEmbedError: onError, fill: true })
      }
    />
  );
}
