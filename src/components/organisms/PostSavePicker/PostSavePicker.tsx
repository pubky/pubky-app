'use client';

import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';
import { Bookmark, Check, Library, Loader2, Plus, SquareLibrary } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/atoms/DropdownMenu/DropdownMenu';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/atoms/Sheet/Sheet';
import { Typography } from '@/atoms/Typography/Typography';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { COLLECTION_NAME_MAX_CHARACTER_LENGTH } from '@/config/posts';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { type PostSaveCollectionTarget, usePostSaveTargets } from '@/hooks/usePostSaveTargets/usePostSaveTargets';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';

type PostSavePickerProps = {
  postId: string;
  /**
   * Class merged into the trigger Button. `PostActionsBar` passes its variant
   * styling (default vs. visual / overlay) so the save trigger stays visually
   * consistent with sibling action buttons.
   */
  buttonClassName: string;
};

type SavePickerLayout = 'dropdown' | 'sheet';
type SaveTriggerIconState = 'default' | 'saved';

type SaveTargetIconProps = {
  isSaved: boolean;
  isBusy: boolean;
};

type SavePickerContentProps = {
  layout: SavePickerLayout;
  isBookmarked: boolean;
  isBookmarkBusy: boolean;
  collections: PostSaveCollectionTarget[];
  isCollectionsLoading: boolean;
  isCreatingCollection: boolean;
  toggleBookmark: () => Promise<void>;
  toggleCollection: (collectionId: string) => Promise<void>;
  createCollectionWithPost: (name: string) => Promise<void>;
};

function SaveTargetIcon({ isSaved, isBusy }: SaveTargetIconProps) {
  if (isBusy) {
    return <Loader2 className="size-4 animate-spin" />;
  }

  if (isSaved) {
    return <Check className="size-4 text-brand" />;
  }

  return null;
}

function SaveTriggerIcon({ state }: { state: SaveTriggerIconState }) {
  const iconClassName = (targetState: SaveTriggerIconState) =>
    cn(
      'absolute inset-0 transition-[opacity,transform] duration-150 ease-out',
      state === targetState ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
    );

  return (
    <Typography
      as="span"
      overrideDefaults
      data-cy="post-save-trigger-icon"
      data-state={state}
      className="relative size-4"
    >
      <Library aria-hidden="true" className={iconClassName('default')} />
      <SquareLibrary aria-hidden="true" className={iconClassName('saved')} />
    </Typography>
  );
}

function SavePickerRow({
  layout,
  disabled,
  dataCy,
  onActivate,
  children,
}: {
  layout: SavePickerLayout;
  disabled?: boolean;
  dataCy?: string;
  onActivate: () => void;
  children: ReactNode;
}) {
  if (layout === 'dropdown') {
    return (
      <DropdownMenuItem
        disabled={disabled}
        onSelect={(event) => {
          event.preventDefault();
          onActivate();
        }}
        className="w-full gap-2 p-0 text-base font-medium text-muted-foreground"
        data-cy={dataCy}
      >
        {children}
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      overrideDefaults
      disabled={disabled}
      onClick={onActivate}
      className="flex w-full cursor-pointer items-center gap-2 rounded-sm p-0 text-base font-medium text-muted-foreground disabled:opacity-50"
      data-cy={dataCy}
    >
      {children}
    </Button>
  );
}

function CollectionRow({
  layout,
  collection,
  onToggleCollection,
}: {
  layout: SavePickerLayout;
  collection: PostSaveCollectionTarget;
  onToggleCollection: (collectionId: string) => Promise<void>;
}) {
  return (
    <SavePickerRow
      layout={layout}
      disabled={collection.isUpdating}
      onActivate={() => void onToggleCollection(collection.id)}
    >
      <Library className="size-4" />
      <Typography
        as="span"
        overrideDefaults
        className={cn('min-w-0 flex-1 truncate', layout === 'sheet' && 'text-left')}
      >
        {collection.name}
      </Typography>
      <SaveTargetIcon isSaved={collection.isSaved} isBusy={collection.isUpdating} />
    </SavePickerRow>
  );
}

function SavePickerContent({
  layout,
  isBookmarked,
  isBookmarkBusy,
  collections,
  isCollectionsLoading,
  isCreatingCollection,
  toggleBookmark,
  toggleCollection,
  createCollectionWithPost,
}: SavePickerContentProps) {
  const t = useTranslations('postSave');
  const [newCollectionName, setNewCollectionName] = useState('');
  const canCreate = newCollectionName.trim().length > 0 && !isCreatingCollection;

  const handleCreate = async () => {
    if (!canCreate) return;
    await createCollectionWithPost(newCollectionName);
    setNewCollectionName('');
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Stop the menu/sheet from intercepting typing (e.g. type-ahead in
    // DropdownMenu, copy/paste shortcuts) so the inline name field behaves
    // like a normal text input even when nested inside the menu.
    event.stopPropagation();
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void handleCreate();
  };

  return (
    <Container overrideDefaults className={cn('flex w-full flex-col', layout === 'sheet' ? 'gap-4' : 'gap-3')}>
      {/* Bookmark + collections scroll as one region so a long collection list
          can't push the "New collection" creator off-screen and out of reach.
          `max-h-[50dvh]` keeps the picker within the viewport on both the
          desktop dropdown and the mobile sheet. */}
      <Container
        overrideDefaults
        className={cn('flex max-h-[50dvh] flex-col overflow-y-auto', layout === 'sheet' ? 'gap-4' : 'gap-3')}
      >
        <SavePickerRow
          layout={layout}
          disabled={isBookmarkBusy}
          dataCy="post-save-bookmarks-option"
          onActivate={() => void toggleBookmark()}
        >
          <Bookmark className="size-4" />
          <Typography
            as="span"
            overrideDefaults
            className={cn('min-w-0 flex-1 truncate', layout === 'sheet' && 'text-left')}
          >
            {t('bookmarks')}
          </Typography>
          <SaveTargetIcon isSaved={isBookmarked} isBusy={isBookmarkBusy} />
        </SavePickerRow>

        {isCollectionsLoading ? (
          <Container overrideDefaults className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <Typography overrideDefaults className="text-base font-medium">
              {t('loadingCollections')}
            </Typography>
          </Container>
        ) : (
          collections.map((collection) => (
            <CollectionRow
              key={collection.id}
              layout={layout}
              collection={collection}
              onToggleCollection={toggleCollection}
            />
          ))
        )}
      </Container>

      {layout === 'dropdown' ? <DropdownMenuSeparator /> : <Container overrideDefaults className="h-px bg-muted" />}

      <Container overrideDefaults className={cn('flex flex-col gap-2', layout === 'dropdown' && 'pt-1')}>
        <Label className="text-xs tracking-widest text-muted-foreground uppercase">{t('newCollection')}</Label>
        <Container
          overrideDefaults
          className="flex items-center gap-2 rounded-md border border-dashed border-input px-4 py-3"
        >
          <Input
            value={newCollectionName}
            onChange={(event) => setNewCollectionName(event.target.value)}
            onKeyDown={handleInputKeyDown}
            maxLength={COLLECTION_NAME_MAX_CHARACTER_LENGTH}
            placeholder={t('collectionNamePlaceholder')}
            className="h-auto border-none p-0 shadow-none"
            disabled={isCreatingCollection}
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-6"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
            aria-label={t('createCollection')}
          >
            {isCreatingCollection ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </Container>
      </Container>
    </Container>
  );
}

export function PostSavePicker({ postId, buttonClassName }: PostSavePickerProps) {
  const t = useTranslations('postSave');
  const isMobile = useIsMobile();
  const { requireAuth } = useRequireAuth();
  const feed = useTimelineFeedContext();
  const feedVariant = feed?.variant;
  const feedCollectionId = feed?.collectionId;
  const removePosts = feed?.removePosts;
  const [open, setOpen] = useState(false);
  const saveTargets = usePostSaveTargets(postId);
  const isBookmarkBusy = saveTargets.isBookmarkLoading || saveTargets.isBookmarkToggling;
  const isBookmarkResolved = !saveTargets.isBookmarkLoading && !saveTargets.isBookmarkToggling;
  const shouldRemoveFromBookmarksFeed =
    feedVariant === TIMELINE_FEED_VARIANT.BOOKMARKS && !open && isBookmarkResolved && !saveTargets.isBookmarked;
  const currentCollectionTarget =
    feedVariant === TIMELINE_FEED_VARIANT.COLLECTION && feedCollectionId
      ? saveTargets.collections.find((collection) => collection.id === feedCollectionId)
      : undefined;
  const isSavedToLibrary = saveTargets.isBookmarked || saveTargets.collections.some((collection) => collection.isSaved);
  const triggerIconState: SaveTriggerIconState = isSavedToLibrary ? 'saved' : 'default';
  const shouldRemoveFromCollectionFeed =
    feedVariant === TIMELINE_FEED_VARIANT.COLLECTION &&
    !open &&
    !saveTargets.isCollectionsLoading &&
    currentCollectionTarget !== undefined &&
    !currentCollectionTarget.isUpdating &&
    !currentCollectionTarget.isSaved;

  // Closing the picker commits the save session. On finite library feeds, a post
  // that no longer belongs to the current target should leave the grid so the
  // visible list matches the live membership. While the picker stays open, the
  // user can freely toggle targets without the card shifting under them.
  useEffect(() => {
    if ((!shouldRemoveFromBookmarksFeed && !shouldRemoveFromCollectionFeed) || !removePosts) return;
    removePosts(postId);
  }, [postId, removePosts, shouldRemoveFromBookmarksFeed, shouldRemoveFromCollectionFeed]);

  const trigger = (
    <Button
      variant="secondary"
      size="sm"
      // `w-10` keeps the icon-only trigger the same width as sibling action
      // buttons in `PostActionsBar` (which carry an icon + count and grow naturally).
      className={cn(buttonClassName, 'w-10')}
      aria-label={t('open')}
      data-cy="post-bookmark-btn"
    >
      <SaveTriggerIcon state={triggerIconState} />
    </Button>
  );

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpen(false);
      return;
    }

    requireAuth(() => setOpen(true));
  };

  const contentProps = { ...saveTargets, isBookmarkBusy };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined} className="rounded-t-xl border-border bg-popover">
          <SheetHeader>
            <SheetTitle>{t('title')}</SheetTitle>
          </SheetHeader>
          <SavePickerContent layout="sheet" {...contentProps} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-70">
        <SavePickerContent layout="dropdown" {...contentProps} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
