'use client';

import { useMemo } from 'react';
import { Container } from '@/atoms/Container/Container';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import { getFirstLinkUrl } from '@/libs/post/postLinkUrl';
import { useIsNestedPostPreview } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { ParseUrlForLinkEmbedResult, PostLinkEmbedsProps } from './PostLinkEmbeds.types';
import { Generic } from './Providers/Generic/ProviderGeneric';
import { InApp } from './Providers/InApp/ProviderInApp';
import type { EmbedProvider } from './Providers/Provider.types';
import { Twitter } from './Providers/Twitter/ProviderTwitter';
import { Vimeo } from './Providers/Vimeo/ProviderVimeo';
import { Youtube } from './Providers/Youtube/ProviderYoutube';

// Register all embed providers here
const EMBED_PROVIDERS: EmbedProvider[] = [
  Youtube,
  Vimeo,
  Twitter,
  Generic,
  // Add more providers here:
  // Twitch,
];

/**
 * Create a hostname-to-provider lookup map for O(1) performance
 * Lazily initialized on first use to avoid module circular dependency issues
 */
let PROVIDER_MAP: Map<string, EmbedProvider> | null = null;

const getProviderMap = (): Map<string, EmbedProvider> => {
  if (!PROVIDER_MAP) {
    PROVIDER_MAP = new Map<string, EmbedProvider>(
      EMBED_PROVIDERS.flatMap((provider) => provider.domains.map((domain) => [domain, provider] as const)),
    );
  }
  return PROVIDER_MAP;
};

/**
 * Parse a link for its embed and provider
 *
 * In-app post/collection URLs are checked before the provider map: the current
 * origin is dynamic so it can't be a static map key. When `allowInApp` is false
 * (inside an embedded post preview) an in-app URL renders no embed at all — the
 * plain link text from PostText is enough, and a generic OG card of our own SPA
 * page would only add noise.
 */
const parseUrlForLinkEmbed = (url: string | null, allowInApp: boolean): ParseUrlForLinkEmbedResult => {
  try {
    if (!url) return { embed: null, provider: null };

    const inAppEmbed = InApp.parseEmbed(url);
    if (inAppEmbed) {
      return allowInApp ? { embed: inAppEmbed, provider: InApp } : { embed: null, provider: null };
    }

    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();

    // O(1) lookup using the provider map
    const providerMap = getProviderMap();
    const provider = providerMap.get(hostname);

    if (!provider) {
      const embed = Generic.parseEmbed(url);
      return { embed, provider: Generic };
    }

    const embed = provider.parseEmbed(url);

    if (!embed) {
      const embed = Generic.parseEmbed(url);
      return { embed, provider: Generic };
    }

    return { embed, provider };
  } catch {
    return { embed: null, provider: null };
  }
};

/**
 * Embeds `url` when given, else the first link of `content`. Only `url`, the link the post embeds, is
 * the post's embed: a generic link there shows as the external resource card. A link that is only in
 * the text keeps its own website preview, since the post does not reference that resource.
 */
export const PostLinkEmbeds = ({ content = '', url, isComposing = false }: PostLinkEmbedsProps) => {
  const isNested = useIsNestedPostPreview();
  const { embed, provider } = useMemo(
    () => parseUrlForLinkEmbed(url || getFirstLinkUrl(content), !isNested),
    [content, url, isNested],
  );
  const mediaContainerRef = usePauseMediaOutsideViewport();

  if (!embed || !provider) return null;

  return (
    <Container ref={mediaContainerRef} className="w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {provider.renderEmbed(embed, { isComposing, isPostEmbed: Boolean(url) })}
    </Container>
  );
};
