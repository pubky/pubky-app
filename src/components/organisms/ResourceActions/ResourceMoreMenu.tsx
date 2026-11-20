'use client';

import { type ReactNode, useState } from 'react';
import { Ellipsis, FileText, Link } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { MENU_VARIANT, type MenuVariant } from '@/config/ui';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useShareUrl } from '@/hooks/useShareUrl/useShareUrl';
import { PostActionButton } from '@/organisms/PostActionsBar/PostActionButton';
import {
  PostMenuActionList,
  type PostMenuActionListItem,
} from '@/organisms/PostMenuActions/PostMenuActionList/PostMenuActionList';

/** What renders extra ⋯ menu entries after the card's own, in the dropdown or the mobile sheet. */
export type ResourceExtraMenuContent = (props: { variant: MenuVariant; closeMenu: () => void }) => ReactNode;

interface ResourceMoreMenuProps {
  /** The external resource's link exactly as written: copied when it has no web link. */
  uri: string;
  /** Its web link (`getResourceLinks().linkUrl`), copied; `null` for a non-web URI. */
  linkUrl: string | null;
  /** The card's title, copied by "Copy title"; no item without one. */
  title?: string | null;
  extraMenuContent?: ResourceExtraMenuContent;
}

/**
 * The ⋯ of an external resource card: the post's More button and menu (a dropdown, a bottom sheet
 * on a phone) with what fits a link: copy its link, copy its title. The card's header already opens
 * the link on its site. Every item only reads, so the menu opens signed out too.
 */
export function ResourceMoreMenu({ uri, linkUrl, title, extraMenuContent }: ResourceMoreMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { shareUrl: copyLink } = useShareUrl({ successTitle: 'Link copied to clipboard' });
  const { copyToClipboard: copyTitle } = useCopyToClipboard({ successTitle: 'Title copied' });
  const closeMenu = () => setOpen(false);

  const items: PostMenuActionListItem[] = [
    {
      id: 'copy-link',
      label: 'Copy link',
      icon: Link,
      onClick: async () => {
        // useShareUrl reports its own success/failure toasts and never throws.
        await copyLink(linkUrl ?? uri);
      },
    },
  ];
  if (title) {
    items.push({
      id: 'copy-title',
      label: 'Copy title',
      icon: FileText,
      onClick: async () => {
        await copyTitle(title);
      },
    });
  }

  const trigger = (
    <PostActionButton icon={Ellipsis} surface="muted" ariaLabel="More options" data-testid="resource-more-button" />
  );
  const content = (variant: MenuVariant) => (
    <>
      <PostMenuActionList
        items={items}
        variant={variant}
        onActionComplete={closeMenu}
        dataCyPrefix="resource-menu-action"
      />
      {extraMenuContent?.({ variant, closeMenu })}
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" onOpenAutoFocus={(event) => event.preventDefault()}>
          <SheetHeader>
            <SheetTitle className="sr-only">{'External resource actions'}</SheetTitle>
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
        className="flex w-56 flex-col gap-2.5"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {content(MENU_VARIANT.DROPDOWN)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
