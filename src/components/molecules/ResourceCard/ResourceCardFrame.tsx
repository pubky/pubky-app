'use client';

import { useRouter } from 'next/navigation';
import { ArrowUpRight } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { useIsPostPreviewNavigable } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import { isCardSurfaceClick } from './ResourceCard.utils';
import { ResourceSourceIcon } from './ResourceSourceIcon';
import { useResourceSurface } from './ResourceSurfaceContext';

/**
 * Keeps the card's own grey text above 4.5:1 on the embed and large-card surfaces in both themes.
 * Set on the body only, so the reused footer (tags and actions) looks as it does on a post.
 */
export const CARD_MUTED_TEXT =
  '[--color-muted-foreground:color-mix(in_oklab,var(--foreground)_58%,var(--embed))] light:[--color-muted-foreground:color-mix(in_oklab,var(--foreground)_66%,var(--embed))]';

interface ResourceCardFrameProps extends Omit<
  React.HTMLAttributes<HTMLElement>,
  'onClick' | 'onAuxClick' | 'onKeyDown'
> {
  /**
   * The resource's page (`getResourceRoute`) a click on the card itself opens, as its title does,
   * or `null` for a card with no click-through. Keyboard users reach the same page through the
   * title (in `ResourceEmbedFrame`, the type). The card's header and body show the pointer, its
   * bottom zone of actions and tags does not.
   */
  clickThroughUrl: string | null;
  children: ReactNode;
}

/**
 * The frame an external resource sits in inside a post: the app's embedded-post surface
 * (`rounded-md bg-embed`, like a quoted post), in two parts with no line between them: the
 * header and body, then the bottom zone of actions and tags. The resource page's large card
 * overrides the surface through `className`.
 *
 * With a `clickThroughUrl`, a mouse click anywhere on the card that is not one of its controls
 * opens the resource's page as a link to it would (`usePostNavigation` for a post): in this tab, or
 * in a new one on Cmd/Ctrl/Shift-click, on a middle click, and where links may not navigate (the
 * composer, a post quoted in a dialog). Only the header's source opens the link itself. The frame
 * has no interactive role, so no control is nested in another; clicks, and Enter or Space on the
 * card's links and controls, never reach the surrounding post (a quoted post opens itself on
 * either key, wherever it came from).
 *
 * A card that is the item itself, in no post (a collection's), or that sits in a quoted post
 * (`ResourceSurfaceProvider` `card`) stands on the post card's surface instead, as the resource
 * page's large card does.
 */
export function ResourceCardFrame({ clickThroughUrl, className, children, ...props }: ResourceCardFrameProps) {
  const onCard = useResourceSurface() === 'card';
  const router = useRouter();
  const navigable = useIsPostPreviewNavigable();

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!clickThroughUrl || !isCardSurfaceClick(event.currentTarget, event.target)) return;
    // Selecting text on the card is not a click on it.
    if (window.getSelection()?.toString()) return;
    if (!navigable || event.metaKey || event.ctrlKey || event.shiftKey) {
      window.open(clickThroughUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    router.push(clickThroughUrl);
  };

  const handleAuxClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (event.button !== 1 || !clickThroughUrl || !isCardSurfaceClick(event.currentTarget, event.target)) return;
    event.preventDefault();
    window.open(clickThroughUrl, '_blank', 'noopener,noreferrer');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  };

  return (
    <Container
      as="article"
      overrideDefaults
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onKeyDown={handleKeyDown}
      data-click-through={clickThroughUrl ? 'true' : undefined}
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden rounded-md bg-embed',
        onCard && 'bg-card text-card-foreground shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </Container>
  );
}

interface ResourceCardHeaderProps {
  /** The type in plain words, top left; nothing for an untyped link. */
  typeLabel: string | null;
  /**
   * Where the type links (the resource's page), for a card with no title to carry that link (a
   * platform embed in `ResourceEmbedFrame`); plain text otherwise.
   */
  typeHref?: string;
  /** The URI the source names, for its icon (the card's own link when web). */
  sourceUri: string;
  /** Where the source links: the link as written, `http(s)` only. */
  href: string | null;
  /** The site's name (`card.site`, else the host without `www.`); never the full link. */
  siteName: string | null;
}

/** The type line on the left and the source on the right: the site's icon and name, linking out. */
export function ResourceCardHeader({ typeLabel, typeHref, sourceUri, href, siteName }: ResourceCardHeaderProps) {
  const navigable = useIsPostPreviewNavigable();
  // Never cut short: on a narrow card the type wraps instead (on a phone the switch and the link
  // show their icons only, so it rarely has to).
  const typeClassName = 'min-w-0 text-xs font-medium tracking-wide text-muted-foreground uppercase';
  return (
    <Container overrideDefaults className="flex min-w-0 items-center justify-between gap-3">
      {typeLabel &&
        (typeHref ? (
          // Where links may not navigate (the composer), in a new tab, as the card's title does.
          <Link
            href={typeHref}
            target={navigable ? undefined : '_blank'}
            rel={navigable ? undefined : 'noopener noreferrer'}
            overrideDefaults
            aria-label={`${typeLabel}: open the resource page`}
            data-testid="resource-card-type"
            className={cn(typeClassName, 'hover:text-brand')}
          >
            {typeLabel}
          </Link>
        ) : (
          <Typography as="span" overrideDefaults data-testid="resource-card-type" className={typeClassName}>
            {typeLabel}
          </Typography>
        ))}
      <ResourceSource uri={sourceUri} href={href} name={siteName} />
    </Container>
  );
}

/**
 * The site the card's link goes to: favicon, name and ↗, linking out when the link is web. The same
 * text on every card; the link's accessible name says what it does: "Open in <site>".
 */
function ResourceSource({ uri, href, name }: { uri: string; href: string | null; name: string | null }) {
  const className = 'ml-auto flex min-w-0 shrink items-center gap-1.5 text-xs font-medium text-muted-foreground';

  // Without a name the icon alone would be an unlabelled link: the title opens the resource instead.
  if (!href || !name) {
    return (
      <Typography as="span" overrideDefaults data-testid="resource-card-source" className={className}>
        <ResourceSourceIcon uri={uri} />
        {name && <span className="truncate">{name}</span>}
      </Typography>
    );
  }
  return (
    <Link
      href={href}
      overrideDefaults
      aria-label={`Open in ${name}`}
      data-testid="resource-card-source"
      className={cn(className, 'hover:text-brand max-sm:shrink-0')}
    >
      <ResourceSourceIcon uri={uri} />
      <span className="truncate max-sm:hidden">{name}</span>
      <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
    </Link>
  );
}
