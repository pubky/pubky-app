'use client';

import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import { getShowPostLabel } from '@/molecules/PostLinkEmbeds/Providers/Native/nativeEmbed.utils';
import { FACADE_BUTTON_CLASS, FACADE_ROW_CLASS, FacadeGlyph, FacadeMark } from './ResourcePlayerFacade';

/** What a focusable control in a card looks like, for the focus to land on. */
const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ResourcePostPressProps {
  /** The post's link: its site's icon, from the app's favicon route. */
  link: string;
  /** The post's site, as the card's header names it ("instagram.com"). */
  siteName: string;
  isOpen: boolean;
  /** The press (`true`) and Close (`false`). */
  onOpenChange: (isOpen: boolean) => void;
  /** The site's post, shown in the press's place while open; never rendered before the press. */
  children: ReactNode;
  /** The post frame's own maximum width (px, Instagram's): Close stays beside the post on a wider card. */
  maxWidth?: number;
}

/**
 * A post whose card has no post text (`getResourcePost` is `null`: Pinakes could not read it, its name is
 * the link's shape alone, or the site refused the read) but whose own link has a post frame: in the
 * card, under its text, the place where the site's post will show, drawn with
 * the parts of a service's drawn player (`ResourcePlayerFacade`'s button, row, mark and Play glyph):
 * "Show post", the site's mark and the glyph, one button. It is its own slim component rather than the
 * facade itself: the facade draws a whole player (a 420 px box, its title again), where inside a card
 * only the press belongs. Nothing loads from the site before the press. The press shows the site's post
 * (`children`) in its place, inside the card, at the card's full width with Close above it; Close shows
 * the card as it was. The focus follows: to Close after the press, back to the press after Close; when
 * the post closes otherwise (it could not be shown) with the focus in it, to the press, else to the card.
 */
export function ResourcePostPress({
  link,
  siteName,
  isOpen,
  onOpenChange,
  children,
  maxWidth,
}: ResourcePostPressProps) {
  const pressRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLDivElement>(null);
  // Set by the press and by Close: the control that takes its place takes the focus, once.
  const moveFocus = useRef(false);
  // The focus is in the open post (Close, or the post itself).
  const focusInside = useRef(false);
  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      (isOpen ? closeRef : pressRef).current?.focus({ preventScroll: true });
    } else if (!isOpen && focusInside.current) {
      // Closed without Close (the post could not be shown): the focus would be lost with it.
      const lost = !document.activeElement || document.activeElement === document.body;
      if (lost) pressRef.current?.focus({ preventScroll: true });
    }
    if (!isOpen) focusInside.current = false;
  }, [isOpen]);
  // Gone while open with the focus in the post (its card shows without the press): the card takes it.
  useLayoutEffect(() => {
    const open = openRef;
    return () => {
      const root = open.current;
      if (!root || !root.contains(document.activeElement)) return;
      const card = root.closest('[data-resource-card]');
      const target = Array.from(card?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).find(
        (node) => !root.contains(node),
      );
      target?.focus({ preventScroll: true });
    };
  }, []);
  const toggle = (next: boolean) => {
    moveFocus.current = true;
    onOpenChange(next);
  };

  if (isOpen) {
    return (
      <Container
        ref={openRef}
        overrideDefaults
        data-testid="post-press-open"
        onFocus={() => {
          focusInside.current = true;
        }}
        // No wider than the post, so Close stays at the post's edge.
        style={maxWidth ? { maxWidth } : undefined}
        className="flex min-w-0 flex-col items-end gap-1"
      >
        <Button
          ref={closeRef}
          variant="ghost"
          size="sm"
          aria-label={getShowPostLabel(siteName, true)}
          data-testid="post-press-close"
          onClick={() => toggle(false)}
          className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" />
        </Button>
        {/* The post keeps the card's whole width (Instagram's lays out at 326 px at least). */}
        <Container overrideDefaults className="w-full min-w-0">
          {children}
        </Container>
      </Container>
    );
  }

  return (
    <button
      ref={pressRef}
      type="button"
      aria-label={`Show post from ${siteName}`}
      onClick={() => toggle(true)}
      data-testid="post-press"
      className={cn(FACADE_BUTTON_CLASS, FACADE_ROW_CLASS)}
    >
      <span aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1">
        <Typography as="span" overrideDefaults className="truncate text-base font-bold">
          Show post
        </Typography>
        <span className="text-muted-foreground">
          <FacadeMark link={link} name={siteName} />
        </span>
      </span>
      <FacadeGlyph testId="post-press-glyph" />
    </button>
  );
}
