'use client';

import { useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useResourceBookmark } from '@/hooks/useResourceBookmark/useResourceBookmark';
import { useResourceSaveTargets } from '@/hooks/useResourceSaveTargets/useResourceSaveTargets';
import { cn } from '@/libs/utils/utils';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import {
  postActionsButtonVariants,
  postActionsCountVariants,
} from '@/organisms/PostActionsBar/PostActionsBar.variants';
import {
  SavePickerContent,
  SaveTriggerIcon,
  type SaveTriggerIconState,
} from '@/organisms/PostSavePicker/PostSavePicker';

interface ResourceSavePickerProps {
  /** The external resource's link exactly as written: the collection item's `uri`. */
  uri: string;
  /**
   * How many public collections hold the link (Pinakes `card.collections`); no number shows when it
   * is absent or 0.
   */
  collectionsCount?: number | null;
  /** What the row sits on: `muted` on a card in a post, `default` on the page's large card. */
  surface?: PostActionSurface;
}

/**
 * Saves an external resource the way a post's save picker saves a post: the viewer's private
 * bookmark, their own collections and "New collection", behind the same trigger. The trigger is
 * `saved` (brand) when the viewer holds the link in a collection of their own (or, while open, has
 * bookmarked it), `collected` when only public collections hold it, and shows how many public
 * collections hold it. The bookmark has no local row, so it is read only while the picker is open.
 * Signed out, it asks to sign in.
 */
export function ResourceSavePicker({ uri, collectionsCount, surface = 'muted' }: ResourceSavePickerProps) {
  const isMobile = useIsMobile();
  const { requireAuth } = useRequireAuth();
  const [open, setOpen] = useState(false);
  const targets = useResourceSaveTargets(uri, { isPickerOpen: open });
  const bookmark = useResourceBookmark(uri, { active: open });
  const count = collectionsCount && collectionsCount > 0 ? collectionsCount : null;
  const isSaved = bookmark.isBookmarked || targets.collections.some((collection) => collection.isSaved);
  const triggerIconState: SaveTriggerIconState = isSaved ? 'saved' : count ? 'collected' : 'default';

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      // The post's save trigger: `w-10` keeps it as wide as its icon + count siblings without a count.
      className={cn(postActionsButtonVariants({ variant: 'default', surface }), !count && 'w-10')}
      aria-label={count ? `Save link (in ${count} public collections)` : 'Save link'}
      data-testid="resource-collections-button"
    >
      <SaveTriggerIcon state={triggerIconState} />
      {count && (
        <Typography
          as="span"
          overrideDefaults
          className={postActionsCountVariants({ variant: 'default' })}
          data-testid="resource-collections-count"
        >
          {count}
        </Typography>
      )}
    </Button>
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpen(false);
      return;
    }
    requireAuth(() => setOpen(true));
  };

  const contentProps = {
    isBookmarked: bookmark.isBookmarked,
    isBookmarkBusy: bookmark.isLoading || bookmark.isToggling,
    toggleBookmark: bookmark.toggle,
    collections: targets.collections,
    isCollectionsLoading: targets.isCollectionsLoading,
    isCreatingCollection: targets.isCreatingCollection,
    hasMoreCollections: targets.hasMoreCollections,
    isCollectionsLoadingMore: targets.isCollectionsLoadingMore,
    loadMoreCollections: targets.loadMoreCollections,
    otherCollectionIds: [],
    isOtherCollectionsLoading: false,
    toggleCollection: targets.toggleCollection,
    createCollectionWithPost: targets.createCollectionWithItem,
  };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          className="flex max-h-dvh flex-col gap-0 rounded-t-xl border-border bg-popover"
        >
          <SheetHeader>
            <SheetTitle>{'Save link'}</SheetTitle>
          </SheetHeader>
          <Container overrideDefaults className="min-h-0 flex-1 overflow-y-auto">
            <SavePickerContent layout="sheet" {...contentProps} />
          </Container>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-70 overflow-y-auto"
      >
        <SavePickerContent layout="dropdown" {...contentProps} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
