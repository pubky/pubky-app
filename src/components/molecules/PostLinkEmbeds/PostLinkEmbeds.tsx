'use client';

import { useMemo } from 'react';
import LinkifyIt from 'linkify-it';
import { Container } from '@/atoms/Container/Container';
import { usePauseMediaOutsideViewport } from '@/hooks/usePauseMediaOutsideViewport/usePauseMediaOutsideViewport';
import type { ParseUrlForLinkEmbedResult, PostLinkEmbedsProps } from './PostLinkEmbeds.types';
import { Generic } from './Providers/Generic/ProviderGeneric';
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

// Protocol types to ignore when parsing links
const IGNORED_PROTOCOLS = ['ftp:', 'mailto:'];

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
 * Strip Markdown link syntax from content
 * Removes [text](url) entirely so URLs inside Markdown links aren't detected
 * Handles URLs with nested parentheses (e.g., Wikipedia links like /wiki/Foo_(bar))
 */
const stripMarkdownLinks = (content: string): string => {
  // Pattern handles one level of nested parentheses in URLs
  // [^()]* matches chars that aren't parentheses
  // (?:\([^()]*\)[^()]*)* matches (content) groups and text after them
  return content.replace(/\[([^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, '<stripped-link>');
};

/**
 * Parse content for URLs
 * Returns the first URL
 */
const parseContentForUrl = (content: string) => {
  const linkify = new LinkifyIt();

  // Disable unwanted protocol types
  IGNORED_PROTOCOLS.forEach((protocol) => linkify.add(protocol, null));

  // Strip Markdown link syntax before parsing
  const strippedContent = stripMarkdownLinks(content);
  const match = linkify.match(strippedContent);

  return match?.[0].url;
};

/**
 * Parse content for embeddable links
 * Returns the first embeddable link and its provider
 */
const parseContentForLinkEmbed = (content: string): ParseUrlForLinkEmbedResult => {
  try {
    const url = parseContentForUrl(content);
    if (!url) return { embed: null, provider: null };

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

export const PostLinkEmbeds = ({ content }: PostLinkEmbedsProps) => {
  const { embed, provider } = useMemo(() => parseContentForLinkEmbed(content), [content]);
  const mediaContainerRef = usePauseMediaOutsideViewport();

  if (!embed || !provider) return null;

  return (
    <Container ref={mediaContainerRef} className="w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
      {provider.renderEmbed(embed)}
    </Container>
  );
};
