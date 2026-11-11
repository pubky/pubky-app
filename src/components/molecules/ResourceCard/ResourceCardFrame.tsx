'use client';

import { ArrowUpRight } from 'lucide-react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { isCardSurfaceClick } from './ResourceCard.utils';
import { ResourceSourceIcon } from './ResourceSourceIcon';

interface ResourceCardFrameProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onClick' | 'onKeyDown'> {
  /**
   * Where a click on the card itself goes (a new tab), or `null` for a card with no click-through.
   * Keyboard users reach the same link through the source link in the header. The card's header
   * and body show the pointer, its bottom zone of actions and tags does not.
   */
  clickThroughUrl: string | null;
  children: ReactNode;
}

/**
 * The frame an external resource sits in inside a post: the app's embedded-post surface
 * (`rounded-md bg-embed`, like a quoted post), in two parts with no line between them: the
 * header and body, then the bottom zone of actions and tags.
 *
 * With a `clickThroughUrl`, a mouse click anywhere on the card that is not one of its controls
 * opens the link in a new tab. The frame itself has no interactive role, so no control is nested
 * in another; clicks, and Enter or Space on the card's links and controls, never reach the
 * surrounding post (a quoted post opens itself on either key, wherever it came from).
 */
export function ResourceCardFrame({ clickThroughUrl, className, children, ...props }: ResourceCardFrameProps) {
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (!clickThroughUrl || !isCardSurfaceClick(event.currentTarget, event.target)) return;
    // Selecting text on the card is not a click on it.
    if (window.getSelection()?.toString()) return;
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
      onKeyDown={handleKeyDown}
      data-click-through={clickThroughUrl ? 'true' : undefined}
      className={cn('flex w-full min-w-0 flex-col overflow-hidden rounded-md bg-embed', className)}
      {...props}
    >
      {children}
    </Container>
  );
}

interface ResourceCardHeaderProps {
  /** The type in plain words, top left; nothing for an untyped link. */
  typeLabel: string | null;
  /** The URI the source names, for its icon (the card's own link when web). */
  sourceUri: string;
  /** Where the source links: the link as written, `http(s)` only. */
  href: string | null;
  /** The site's name (`card.site`, else the host without `www.`); never the full link. */
  siteName: string | null;
}

/** The type line on the left and the source on the right: the site's icon and name, linking out. */
export function ResourceCardHeader({ typeLabel, sourceUri, href, siteName }: ResourceCardHeaderProps) {
  return (
    <Container overrideDefaults className="flex min-w-0 items-center justify-between gap-3">
      {typeLabel && (
        <Typography
          as="span"
          overrideDefaults
          data-testid="resource-card-type"
          className="min-w-0 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          {typeLabel}
        </Typography>
      )}
      <ResourceSource uri={sourceUri} href={href} name={siteName} />
    </Container>
  );
}

/**
 * The site the card's link goes to: favicon, name and ↗, linking out when the link is web. On a phone
 * the link shows the favicon and ↗ only; "Open in <site>" stays its accessible name.
 */
function ResourceSource({ uri, href, name }: { uri: string; href: string | null; name: string | null }) {
  const className = 'ml-auto flex min-w-0 shrink items-center gap-1.5 text-xs font-medium text-muted-foreground';

  // Without a name the icon alone would be an unlabelled link: the title already links out.
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
      aria-label={`Open in ${name}`}
      overrideDefaults
      data-testid="resource-card-source"
      className={cn(className, 'hover:text-brand max-sm:shrink-0')}
    >
      <ResourceSourceIcon uri={uri} />
      <span className="truncate max-sm:hidden">{name}</span>
      <ArrowUpRight aria-hidden="true" className="size-3 shrink-0" />
    </Link>
  );
}
