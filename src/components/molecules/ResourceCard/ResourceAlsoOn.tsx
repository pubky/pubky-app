'use client';

import { type ReactNode, useId } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { MENU_VARIANT, type MenuVariant } from '@/config/ui';
import { cn } from '@/libs/utils/utils';
import type { TPinakesAlsoOn } from '@/services/pinakes/pinakes.types';
import { groupAlsoOn } from './ResourceAlsoOn.utils';
import { ResourceAlsoOnLanguages } from './ResourceAlsoOnLanguages';
import { getAlsoOnIdentifier, getAlsoOnName, getAlsoOnNote, getHttpUrl } from './ResourceCard.utils';
import { ResourceSourceIcon } from './ResourceSourceIcon';

const LABEL_CLASS_NAME = 'text-xs font-medium tracking-wide text-muted-foreground uppercase';
// The text of the post's ⋯ menu items (`PostMenuActionList`).
const ROW_TEXT_CLASS_NAME =
  'truncate text-base font-medium text-muted-foreground transition-colors group-hover:text-foreground group-focus:text-foreground';

interface ResourceAlsoOnProps {
  /** The card's other services, one entry each and never its own (`pickAlsoOn`); not empty. */
  alsoOn: TPinakesAlsoOn[];
  /** Where it renders: the ⋯ dropdown or the ⋯ bottom sheet on a phone. */
  variant: MenuVariant;
  /** Closes the ⋯ menu once a link is followed (the sheet; a dropdown item closes its menu itself). */
  closeMenu: () => void;
}

/**
 * The last section of a resource card's ⋯ menu: a separator, an "Also on" label, then one row per
 * service in the post menu's style; a service in several languages is one row with a language
 * switcher (`ResourceAlsoOnLanguages`). A row's note is in its accessible name only.
 */
export function ResourceAlsoOn({ alsoOn, variant, closeMenu }: ResourceAlsoOnProps) {
  const labelId = useId();

  const rows = groupAlsoOn(alsoOn).map((row, index) =>
    row.kind === 'languages' ? (
      <ResourceAlsoOnLanguages
        key={`${index}-${row.name}`}
        name={row.name}
        editions={row.editions}
        variant={variant}
        renderRow={({ entry }) => <AlsoOnRow entry={entry} variant={variant} onFollow={closeMenu} />}
      />
    ) : (
      <AlsoOnRow key={`${index}-${row.entry.uri}`} entry={row.entry} variant={variant} onFollow={closeMenu} />
    ),
  );

  if (variant === MENU_VARIANT.SHEET) {
    return (
      <Container
        overrideDefaults
        role="group"
        aria-labelledby={labelId}
        data-testid="resource-also-on"
        className="flex flex-col gap-2 border-t border-border pt-4"
      >
        <Typography as="p" overrideDefaults id={labelId} className={cn('px-4', LABEL_CLASS_NAME)}>
          Also on
        </Typography>
        {rows}
      </Container>
    );
  }

  return (
    <>
      {/* Edge to edge across the content's `p-4`, like a separator in a menu with no padding. */}
      <DropdownMenuSeparator className="-mx-4 my-0" />
      <DropdownMenuLabel id={labelId} className={cn('p-0', LABEL_CLASS_NAME)}>
        Also on
      </DropdownMenuLabel>
      <DropdownMenuGroup aria-labelledby={labelId} data-testid="resource-also-on" className="flex flex-col gap-2.5">
        {rows}
      </DropdownMenuGroup>
    </>
  );
}

interface AlsoOnRowProps {
  entry: TPinakesAlsoOn;
  variant: MenuVariant;
  onFollow: () => void;
}

function AlsoOnRow({ entry, variant, onFollow }: AlsoOnRowProps) {
  const href = getHttpUrl(entry.uri);
  const name = getAlsoOnName(entry);
  const note = href ? getAlsoOnNote(entry) : null;
  // The note follows the visible name, so the row is still found by what it shows.
  const label = note ? `${name}, ${note}` : undefined;
  // A non-web URI (`isbn:`, `doi:`) has nowhere to open: its identifier follows the name.
  const identifier = getAlsoOnIdentifier(entry);
  const content: ReactNode = (
    <>
      <ResourceSourceIcon uri={entry.uri} />
      <Typography as="span" overrideDefaults className={ROW_TEXT_CLASS_NAME}>
        {identifier ? `${name} ${identifier}` : name}
      </Typography>
    </>
  );

  // Listed, not linked (in the sheet plain dimmed text, with no role a disabled state could be announced on).
  if (variant === MENU_VARIANT.SHEET) {
    if (!href) {
      return (
        <Container
          overrideDefaults
          data-testid="resource-also-on-row"
          className="flex h-10 items-center gap-2 overflow-hidden px-4 opacity-50"
        >
          {content}
        </Container>
      );
    }
    return (
      <Button
        variant="ghost"
        asChild
        aria-label={label}
        data-testid="resource-also-on-row"
        className="group justify-start gap-2 overflow-hidden"
      >
        <Link href={href} overrideDefaults onClick={onFollow}>
          {content}
        </Link>
      </Button>
    );
  }

  if (!href) {
    return (
      <DropdownMenuItem disabled data-testid="resource-also-on-row" className="group gap-2 p-0">
        {content}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild aria-label={label} data-testid="resource-also-on-row" className="group gap-2 p-0">
      <Link href={href} overrideDefaults>
        {content}
      </Link>
    </DropdownMenuItem>
  );
}
