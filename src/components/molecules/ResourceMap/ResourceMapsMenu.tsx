'use client';

import { useState } from 'react';
import { Copy, Globe, Map, MapPin, Navigation } from 'lucide-react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { MENU_VARIANT, type MenuVariant } from '@/config/ui';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';
import { isIosDevice } from '@/libs/pwa/platform';
import { cn } from '@/libs/utils/utils';
import {
  PostMenuActionList,
  type PostMenuActionListItem,
} from '@/organisms/PostMenuActions/PostMenuActionList/PostMenuActionList';
import { formatCoordinates, getMapsLinks, type TMapsDestination } from './ResourceMap.utils';

const MENU_TITLE = 'Open in Maps';

interface ResourceMapsMenuProps {
  /** Where the place or event is (`getMapsDestination`). */
  destination: TMapsDestination;
  className?: string;
}

/**
 * "Open in Maps": one round button on every place and event that says where it is (a map's corner,
 * the end of an address line, a selected pin's card), opening the app's own menu (a dropdown, a
 * bottom sheet on a phone-sized screen): the maps apps, then what can be copied. On a phone the
 * device's default maps app comes first, through a `geo:` link; not on an iPhone, where nothing
 * opens `geo:` and Apple Maps opens the app. A maps app opens in a new tab that cannot reach this
 * one. Only coordinates the destination has are copied, and only an address it has.
 */
export function ResourceMapsMenu({ destination, className }: ResourceMapsMenuProps) {
  const isMobile = useIsMobile();
  const isTouch = useIsTouchDevice();
  const [open, setOpen] = useState(false);
  const { copyToClipboard: copyCoordinates } = useCopyToClipboard({ successTitle: 'Coordinates copied' });
  const { copyToClipboard: copyAddress } = useCopyToClipboard({ successTitle: 'Address copied' });
  const links = getMapsLinks(destination);
  const { point, address } = destination;
  const openApp = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const items: PostMenuActionListItem[] = [
    ...(isTouch && !isIosDevice()
      ? [
          {
            id: 'default',
            label: 'Default maps app',
            icon: Navigation,
            // In this tab: the device hands the link to its maps app and the page stays
            onClick: () => {
              window.open(links.geo, '_self');
            },
          },
        ]
      : []),
    { id: 'apple', label: 'Apple Maps', icon: Map, onClick: () => openApp(links.apple) },
    { id: 'google', label: 'Google Maps', icon: MapPin, onClick: () => openApp(links.google) },
    { id: 'osm', label: 'OpenStreetMap', icon: Globe, onClick: () => openApp(links.osm) },
    ...(point
      ? [
          {
            id: 'copy-coordinates',
            label: 'Copy coordinates',
            icon: Copy,
            onClick: async () => {
              await copyCoordinates(formatCoordinates(point));
            },
          },
        ]
      : []),
    ...(address
      ? [
          {
            id: 'copy-address',
            label: 'Copy address',
            icon: Copy,
            onClick: async () => {
              await copyAddress(address);
            },
          },
        ]
      : []),
  ];

  const trigger = (
    <Button
      type="button"
      variant={ButtonVariant.SECONDARY}
      size="icon"
      aria-label={MENU_TITLE}
      title={MENU_TITLE}
      data-testid="resource-maps-menu"
      className={cn('shrink-0 rounded-full shadow-sm', className)}
    >
      <Navigation aria-hidden="true" className="size-4" />
    </Button>
  );
  const content = (variant: MenuVariant) => (
    <PostMenuActionList
      items={items}
      variant={variant}
      onActionComplete={() => setOpen(false)}
      dataCyPrefix="resource-maps-action"
    />
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-dvh overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="sr-only">{MENU_TITLE}</SheetTitle>
          </SheetHeader>
          <Container overrideDefaults className="flex flex-col gap-2">
            {content(MENU_VARIANT.SHEET)}
          </Container>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="flex max-h-[var(--radix-dropdown-menu-content-available-height)] w-56 flex-col gap-2.5 overflow-y-auto"
      >
        {content(MENU_VARIANT.DROPDOWN)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
