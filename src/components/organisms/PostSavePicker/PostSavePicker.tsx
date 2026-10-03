'use client';

import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bookmark, Check, Library, Loader2, Plus, SquareLibrary } from 'lucide-react';
import { getCollectionRoute } from '@/app/routes';
import { Button, buttonVariants } from '@/atoms/Button/Button';
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
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostCounts } from '@/hooks/usePostCounts/usePostCounts';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { type PostSaveCollectionTarget, usePostSaveTargets } from '@/hooks/usePostSaveTargets/usePostSaveTargets';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { useTtlSubscription } from '@/hooks/useTtlSubscription/useTtlSubscription';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { parseCollectionContent } from '@/libs/post/collectionContent';
import { cn, formatPublicKey } from '@/libs/utils/utils';
import { parseCompositeId } from '@/models/models.utils';
import { AvatarWithFallback } from '@/organisms/AvatarWithFallback/AvatarWithFallback';
import { useTimelineFeedContext } from '@/organisms/Timeline/Feed/TimelineFeed/TimelineFeedContext';
import { postActionsCountVariants } from '../PostActionsBar/PostActionsBar.variants';

type PostSavePickerProps = {
  postId: string;
  /**
   * Class merged into the trigger Button. `PostActionsBar` passes its variant
   * styling (default vs. visual / overlay) so the save trigger stays visually
   * consistent with sibling action buttons.
   */
  buttonClassName: string;
  /**
   * Class for the collections count next to the trigger icon. `PostActionsBar`
   * passes its variant's count styling; standalone triggers get the default one.
   */
  countClassName?: string;
};

type SavePickerLayout = 'dropdown' | 'sheet';
/**
 * - `saved`: the viewer bookmarked the post or holds it in one of their own collections (brand icon).
 * - `collected`: only other users' collections curate it (foreground icon).
 * - `default`: nothing curates it.
 */
type SaveTriggerIconState = 'default' | 'saved' | 'collected';

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
  hasMoreCollections: boolean;
  isCollectionsLoadingMore: boolean;
  loadMoreCollections: () => Promise<void>;
  otherCollectionIds: string[];
  isOtherCollectionsLoading: boolean;
  hasMoreOtherCollections: boolean;
  isOtherCollectionsLoadingMore: boolean;
  loadMoreOtherCollections: () => Promise<void>;
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
  const iconClassName = (isVisible: boolean) =>
    cn(
      'absolute inset-0 transition-[opacity,transform] duration-150 ease-out',
      isVisible ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
    );

  return (
    <Typography
      as="span"
      overrideDefaults
      data-cy="post-save-trigger-icon"
      data-state={state}
      className="relative size-4"
    >
      <Library aria-hidden="true" className={iconClassName(state === 'default')} />
      {/* One boxed icon for both curated states; only its colour tells "mine" from "others'". */}
      <SquareLibrary
        aria-hidden="true"
        className={cn(iconClassName(state !== 'default'), state === 'collected' ? 'text-foreground' : 'text-brand')}
      />
    </Typography>
  );
}

function SavePickerLabel({ children }: { children: ReactNode }) {
  return <Label className="text-xs tracking-widest text-muted-foreground uppercase">{children}</Label>;
}

function SavePickerLoadingRow() {
  return (
    <Container overrideDefaults className="flex items-center gap-2 text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      <Typography overrideDefaults className="text-base font-medium">
        {'Loading collections...'}
      </Typography>
    </Container>
  );
}

function SavePickerLoadMoreRow({
  layout,
  isLoadingMore,
  dataCy,
  onActivate,
}: {
  layout: SavePickerLayout;
  isLoadingMore: boolean;
  dataCy: string;
  onActivate: () => void;
}) {
  return (
    <SavePickerRow layout={layout} disabled={isLoadingMore} dataCy={dataCy} onActivate={onActivate}>
      {isLoadingMore && <Loader2 className="size-4 animate-spin" />}
      <Typography as="span" overrideDefaults className={cn('min-w-0 flex-1', layout === 'sheet' && 'text-left')}>
        {'Load more'}
      </Typography>
    </SavePickerRow>
  );
}

/**
 * One of the other users' collections that curate the post: an outline pill that
 * opens the collection page. In the dropdown it is a menu item so arrow keys reach
 * it like every other row.
 */
function OtherCollectionRow({ layout, collectionId }: { layout: SavePickerLayout; collectionId: string }) {
  const { pubky: authorId, id } = parseCompositeId(collectionId);
  const { postDetails } = usePostDetails(collectionId);
  const { profile } = useUserProfile(authorId);
  // A cache hit is never refreshed by the local-first read: the row owns a viewport
  // TTL subscription for its collection, which also holds the author reference.
  const { ref: ttlRef } = useTtlSubscription({ type: 'post', id: collectionId });
  const name = parseCollectionContent(postDetails?.content)?.name;
  const authorName = profile?.name?.trim() || formatPublicKey({ key: authorId });

  // The stream layer hydrates a collection before handing out its id, so a missing
  // envelope means an unreadable one, not one still loading.
  if (!name) return null;

  const href = getCollectionRoute(authorId, id);
  // The design's pill fill (its `background-dark:input/30` token) is a faint lift over the popover
  // that the app's `outline` variant does not reproduce, because `--input` is an opaque grey here;
  // the muted surface token at low alpha lands on the same value and follows the theme.
  const className = cn(
    buttonVariants({ variant: 'outline', size: 'sm' }),
    'w-full justify-start bg-muted/25 hover:bg-muted/50',
  );
  const content = (
    <>
      <Library className="size-4" />
      <Typography
        as="span"
        overrideDefaults
        className="min-w-0 flex-1 truncate text-left text-xs font-bold text-foreground"
      >
        {name}
      </Typography>
      <AvatarWithFallback
        avatarUrl={profile?.avatarUrl}
        name={authorName}
        fallbackSeed={authorId}
        size="xs"
        alt={authorName}
        data-testid="post-save-other-collection-avatar"
      />
    </>
  );

  if (layout === 'dropdown') {
    // The className sits on the item so twMerge resolves it against the menu-item base classes.
    return (
      <DropdownMenuItem asChild className={className} data-cy="post-save-other-collection">
        <Link ref={ttlRef} href={href}>
          {content}
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <Link ref={ttlRef} href={href} className={className} data-cy="post-save-other-collection">
      {content}
    </Link>
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
      dataCy="post-save-collection-option"
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
  hasMoreCollections,
  isCollectionsLoadingMore,
  loadMoreCollections,
  otherCollectionIds,
  isOtherCollectionsLoading,
  hasMoreOtherCollections,
  isOtherCollectionsLoadingMore,
  loadMoreOtherCollections,
  toggleBookmark,
  toggleCollection,
  createCollectionWithPost,
}: SavePickerContentProps) {
  const [newCollectionName, setNewCollectionName] = useState('');
  const canCreate = newCollectionName.trim().length > 0 && !isCreatingCollection;
  // "Also in collections" is informational: it shows only while there is something to show,
  // while the first page is still on its way, or while a further page could still hold other
  // users' collections (a first page made only of the viewer's own is filtered to nothing).
  const showOtherCollections = isOtherCollectionsLoading || otherCollectionIds.length > 0 || hasMoreOtherCollections;
  const separator =
    layout === 'dropdown' ? <DropdownMenuSeparator /> : <Container overrideDefaults className="h-px bg-muted" />;

  // The collection rows are their own scroll region, so the sentinel lives inside
  // it: scrolling the list to its end loads the next page of the author's
  // collections. `itemCount` budgets unproductive auto-loads — a page that only
  // re-serves already-revealed collections (the shared stream can hold more than
  // this picker fetched) stalls and hands over to the manual "Load more" row.
  const { sentinelRef, isStalled, resumeAutoLoad } = useInfiniteScroll({
    onLoadMore: loadMoreCollections,
    hasMore: hasMoreCollections,
    isLoading: isCollectionsLoadingMore,
    threshold: 200,
    debounceMs: 300,
    itemCount: collections.length,
    maxUnproductiveLoads: 1,
  });

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
      <SavePickerLabel>{'Add to collection'}</SavePickerLabel>
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
            {'Bookmarks'}
          </Typography>
          <SaveTargetIcon isSaved={isBookmarked} isBusy={isBookmarkBusy} />
        </SavePickerRow>

        {isCollectionsLoading ? (
          <SavePickerLoadingRow />
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

        {hasMoreCollections && isStalled && (
          <SavePickerLoadMoreRow
            layout={layout}
            isLoadingMore={isCollectionsLoadingMore}
            dataCy="post-save-collections-load-more"
            onActivate={() => void resumeAutoLoad()}
          />
        )}
        {hasMoreCollections && !isStalled && (
          <Container
            overrideDefaults
            ref={sentinelRef}
            data-cy="post-save-collections-sentinel"
            className="flex w-full items-center justify-center py-1"
          >
            {isCollectionsLoadingMore && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </Container>
        )}
      </Container>

      {separator}

      <Container overrideDefaults className={cn('flex flex-col gap-2', layout === 'dropdown' && 'pt-1')}>
        <SavePickerLabel>{'New Collection'}</SavePickerLabel>
        <Container
          overrideDefaults
          className="flex items-center gap-2 rounded-md border border-dashed border-input px-4 py-3"
        >
          <Input
            value={newCollectionName}
            onChange={(event) => setNewCollectionName(event.target.value)}
            onKeyDown={handleInputKeyDown}
            maxLength={COLLECTION_NAME_MAX_CHARACTER_LENGTH}
            placeholder={'Collection name'}
            className="h-auto border-none p-0 shadow-none"
            disabled={isCreatingCollection}
            data-cy="post-save-new-collection-input"
          />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="size-6"
            disabled={!canCreate}
            onClick={() => void handleCreate()}
            aria-label={'Create collection'}
            data-cy="post-save-new-collection-create-btn"
          >
            {isCreatingCollection ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </Container>
      </Container>

      {showOtherCollections && (
        <>
          {separator}
          <Container
            overrideDefaults
            className={cn('flex flex-col gap-2', layout === 'dropdown' && 'pt-1')}
            data-cy="post-save-other-collections"
          >
            <SavePickerLabel>{'Also in collections:'}</SavePickerLabel>
            {/* Its own scroll region (about five rows): the top list already spends half the viewport. */}
            <Container overrideDefaults className="flex max-h-48 flex-col gap-2 overflow-y-auto">
              {isOtherCollectionsLoading ? (
                <SavePickerLoadingRow />
              ) : (
                otherCollectionIds.map((collectionId) => (
                  <OtherCollectionRow key={collectionId} layout={layout} collectionId={collectionId} />
                ))
              )}
              {hasMoreOtherCollections && !isOtherCollectionsLoading && (
                <SavePickerLoadMoreRow
                  layout={layout}
                  isLoadingMore={isOtherCollectionsLoadingMore}
                  dataCy="post-save-other-collections-load-more"
                  onActivate={() => void loadMoreOtherCollections()}
                />
              )}
            </Container>
          </Container>
        </>
      )}
    </Container>
  );
}

export function PostSavePicker({
  postId,
  buttonClassName,
  countClassName = postActionsCountVariants({ variant: 'default' }),
}: PostSavePickerProps) {
  const isMobile = useIsMobile();
  const { requireAuth } = useRequireAuth();
  const feed = useTimelineFeedContext();
  const feedVariant = feed?.variant;
  const feedCollectionId = feed?.collectionId;
  const removePosts = feed?.removePosts;
  const [open, setOpen] = useState(false);
  const saveTargets = usePostSaveTargets(postId, { isPickerOpen: open });
  // How many collections curate the save target (Nexus `counts.collections`, bumped locally on
  // the viewer's own saves). The count and the icon state describe the same post as the picker's
  // membership: on a flattened repost that is the repost entry, not the displayed original whose
  // counts `PostActionsBar` shows, so this row can be a different one and can fetch on a miss.
  const { postCounts } = usePostCounts(postId);
  const collectionsCount = postCounts?.collections ?? 0;
  const hasCollections = collectionsCount > 0;
  const isBookmarkBusy = saveTargets.isBookmarkLoading || saveTargets.isBookmarkToggling;
  const isBookmarkResolved = !saveTargets.isBookmarkLoading && !saveTargets.isBookmarkToggling;
  const shouldRemoveFromBookmarksFeed =
    feedVariant === TIMELINE_FEED_VARIANT.BOOKMARKS && !open && isBookmarkResolved && !saveTargets.isBookmarked;
  const currentCollectionTarget =
    feedVariant === TIMELINE_FEED_VARIANT.COLLECTION && feedCollectionId
      ? saveTargets.collections.find((collection) => collection.id === feedCollectionId)
      : undefined;
  const isSavedToLibrary = saveTargets.isBookmarked || saveTargets.collections.some((collection) => collection.isSaved);
  const triggerIconState: SaveTriggerIconState = isSavedToLibrary ? 'saved' : hasCollections ? 'collected' : 'default';
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
      // With a count the trigger grows like its siblings in `PostActionsBar`; without one
      // `w-10` keeps the icon-only trigger the same width as those icon + count buttons.
      className={cn(buttonClassName, !hasCollections && 'w-10')}
      aria-label={hasCollections ? `Save post (${collectionsCount})` : 'Save post'}
      data-cy="post-bookmark-btn"
    >
      <SaveTriggerIcon state={triggerIconState} />
      {hasCollections && (
        <Typography as="span" overrideDefaults className={countClassName} data-cy="post-save-collections-count">
          {collectionsCount}
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

  const contentProps = { ...saveTargets, isBookmarkBusy };

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" aria-describedby={undefined} className="rounded-t-xl border-border bg-popover">
          <SheetHeader>
            <SheetTitle>{'Save post'}</SheetTitle>
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
