'use client';

import { type ReactNode, useDeferredValue, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/atoms/Dialog/Dialog';
import { DynamicLucideIcon } from '@/atoms/DynamicLucideIcon/DynamicLucideIcon';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Typography } from '@/atoms/Typography/Typography';
import { useControlledState } from '@/hooks/useControlledState/useControlledState';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { Logger } from '@/libs/logger/logger';
import {
  loadLucidePickerIcons,
  type LucidePickerIcon,
  preloadLucideIcons,
  toLucideIconName,
} from '@/libs/lucide/lucideIcons';
import { cn } from '@/libs/utils/utils';

// The grid renders progressively: the first batch on open, another batch each
// time the sentinel scrolls into view. Cells never unmount, so every icon
// chunk is requested at most once and Tab reaches everything rendered.
const APPEND_BATCH_SIZE = 150;
// Warmed on open so the grid's first paint renders icons from cache.
const INITIAL_ICON_PRELOAD_COUNT = 88;

interface IconPickerDialogProps {
  children?: ReactNode;
  value?: string | null;
  onSelect: (iconName: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Explicit icon list; omit to lazily load the full Lucide catalog on open. */
  icons?: readonly string[];
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

function matchesQuery({ name, aliases, tags }: LucidePickerIcon, query: string): boolean {
  return (
    name.includes(query) || aliases.some((alias) => alias.includes(query)) || tags.some((tag) => tag.includes(query))
  );
}

export function IconPickerDialog({
  children,
  value,
  onSelect,
  open,
  defaultOpen = false,
  onOpenChange,
  icons,
  title,
  description,
  searchPlaceholder,
  emptyMessage,
}: IconPickerDialogProps) {
  const { value: resolvedOpen, setValue: setOpen } = useControlledState<boolean>({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  });
  const [query, setQuery] = useState('');
  const [renderedCount, setRenderedCount] = useState(APPEND_BATCH_SIZE);
  const [loadedPickerIcons, setLoadedPickerIcons] = useState<readonly LucidePickerIcon[] | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const resolvedTitle = title ?? 'Choose icon';
  const resolvedSearchPlaceholder = searchPlaceholder ?? 'Search for icon';
  const resolvedEmptyMessage = emptyMessage ?? 'No icons found';

  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '-');
  // Deferred so typing stays instant and superseded filter work — and the
  // icon chunk loads it would mount — is abandoned, not committed.
  const deferredQuery = useDeferredValue(normalizedQuery);
  const isFilterPending = deferredQuery !== normalizedQuery;

  const pickerIcons: readonly LucidePickerIcon[] = icons
    ? icons
        .map(toLucideIconName)
        .filter((name) => name !== null)
        .map((name) => ({ name, aliases: [], tags: [] }))
    : (loadedPickerIcons ?? []);
  const isCatalogLoading = !icons && loadedPickerIcons === null && !catalogFailed;
  // Search matches the canonical name, its deprecated aliases ('home' finds
  // 'house'), and lucide's synonym tags ('delete' finds the trash icons);
  // name matches rank first so exact vocabulary lands above tag hits.
  const filteredIcons =
    deferredQuery === ''
      ? pickerIcons
      : pickerIcons
          .filter((entry) => matchesQuery(entry, deferredQuery))
          .sort((a, b) => Number(b.name.includes(deferredQuery)) - Number(a.name.includes(deferredQuery)));
  const visibleIcons = filteredIcons.slice(0, renderedCount);
  const hasMoreIcons = renderedCount < filteredIcons.length;

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: () => setRenderedCount((count) => count + APPEND_BATCH_SIZE),
    hasMore: hasMoreIcons,
    isLoading: false,
    debounceMs: 0,
  });

  // Load the lazily-chunked catalog the first time the dialog opens without
  // an explicit icon list.
  useEffect(() => {
    if (!resolvedOpen || icons || loadedPickerIcons) return;

    let cancelled = false;
    setCatalogFailed(false);
    // Both branches must be handled here: the loader attaches its own catch to
    // the cached promise, but this `.then` derives a new one — leaving it
    // unhandled would surface as an unhandled rejection and strand the grid in
    // its loading state, since the effect's deps never change again.
    loadLucidePickerIcons().then(
      (entries) => {
        if (!cancelled) setLoadedPickerIcons(entries);
      },
      (error: unknown) => {
        Logger.warn('Failed to load the Lucide icon catalog', { error });
        if (!cancelled) setCatalogFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [resolvedOpen, icons, loadedPickerIcons]);

  useEffect(() => {
    if (!resolvedOpen) return;
    const names = icons ?? (loadedPickerIcons ?? []).map((icon) => icon.name);
    preloadLucideIcons(names.slice(0, INITIAL_ICON_PRELOAD_COUNT));
  }, [resolvedOpen, icons, loadedPickerIcons]);

  // A new search starts from the first batch again.
  useEffect(() => {
    setRenderedCount(APPEND_BATCH_SIZE);
  }, [deferredQuery]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery('');
      setRenderedCount(APPEND_BATCH_SIZE);
      // The loader drops its cached promise on failure, so reopening retries.
      setCatalogFailed(false);
    }
    setOpen(nextOpen);
  };

  const handleSelect = (iconName: string) => {
    onSelect(iconName);
    handleOpenChange(false);
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = 0;
  };

  const handleClearQuery = () => {
    handleQueryChange('');
    searchInputRef.current?.focus();
  };

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}

      <DialogContent
        className="flex h-110 w-lg max-w-[calc(100vw-2rem)] flex-col gap-6 overflow-hidden p-6 sm:max-w-lg sm:p-8"
        data-testid="icon-picker-dialog-content"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{resolvedTitle}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Label htmlFor="icon-picker-search" className="sr-only">
          {resolvedSearchPlaceholder}
        </Label>
        <Container overrideDefaults className="relative shrink-0">
          <Input
            ref={searchInputRef}
            id="icon-picker-search"
            type="search"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder={resolvedSearchPlaceholder}
            aria-label={resolvedSearchPlaceholder}
            className="h-14 rounded-md border border-dashed border-input px-6 pr-12 text-lg shadow-none [&::-webkit-search-cancel-button]:appearance-none"
            data-testid="icon-picker-search"
          />
          {query.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear search"
              onClick={handleClearQuery}
              className="absolute top-1/2 right-3 size-8 -translate-y-1/2 cursor-pointer text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground"
              data-testid="icon-picker-clear-search"
            >
              <X className="size-4" />
            </Button>
          )}
        </Container>

        <Typography overrideDefaults as="span" role="status" className="sr-only">
          {isCatalogLoading ? 'Loading icons' : `${filteredIcons.length} icons`}
        </Typography>

        <Container
          overrideDefaults
          ref={scrollAreaRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
          data-testid="icon-picker-scroll-area"
          aria-busy={isCatalogLoading || isFilterPending ? true : undefined}
        >
          {isCatalogLoading ? (
            <Container overrideDefaults className="h-full" data-testid="icon-picker-loading" />
          ) : filteredIcons.length === 0 ? (
            <Typography
              overrideDefaults
              className="flex h-full items-center justify-center text-sm text-muted-foreground"
              data-testid="icon-picker-empty"
            >
              {resolvedEmptyMessage}
            </Typography>
          ) : (
            <>
              <Container
                overrideDefaults
                className="grid grid-cols-6 gap-x-2 gap-y-4 sm:grid-cols-10"
                data-testid="icon-picker-grid"
              >
                {visibleIcons.map(({ name: iconName }) => {
                  const isSelected = iconName === value;
                  const accessibleName = iconName.replaceAll('-', ' ');

                  return (
                    <Button
                      key={iconName}
                      type="button"
                      variant={isSelected ? 'default' : 'ghost'}
                      size="icon"
                      aria-label={accessibleName}
                      aria-pressed={isSelected}
                      title={accessibleName}
                      onClick={() => handleSelect(iconName)}
                      className={cn(
                        'size-9 rounded-md p-0 shadow-none',
                        !isSelected && 'text-foreground hover:text-foreground',
                      )}
                      data-testid={`icon-picker-option-${iconName}`}
                    >
                      <DynamicLucideIcon name={iconName} fallback={null} className="size-6" aria-hidden="true" />
                    </Button>
                  );
                })}
              </Container>
              {hasMoreIcons && (
                <Container overrideDefaults ref={sentinelRef} className="h-6" data-testid="icon-picker-sentinel" />
              )}
            </>
          )}
        </Container>
      </DialogContent>
    </Dialog>
  );
}
