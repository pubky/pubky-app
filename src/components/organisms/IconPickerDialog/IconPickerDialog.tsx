'use client';

import { type ReactNode, type UIEvent, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
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
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import {
  isPlausibleLucideIconName,
  loadLucidePickerIcons,
  type LucidePickerIcon,
  preloadLucideIcons,
} from '@/libs/utils/lucideIcons';
import { cn } from '@/libs/utils/utils';

// The virtualization math below is coupled to the grid's Tailwind classes:
// the column counts must match `grid-cols-6 sm:grid-cols-11` (and the `sm`
// breakpoint of useIsMobile), and the row height is the `size-9` cell (36px)
// plus the `gap-y-4` row gap (16px). Keep them in sync when restyling.
const MOBILE_COLUMN_COUNT = 6;
const DESKTOP_COLUMN_COUNT = 11;
const ICON_ROW_HEIGHT_PX = 52;
const FALLBACK_VIEWPORT_HEIGHT_PX = 208;
const OVERSCAN_ROW_COUNT = 1;
const OPEN_ANIMATION_FALLBACK_MS = 250;
// 8 desktop rows (11 columns) ≈ the first visible window plus overscan on
// both breakpoints, warmed during the dialog's open animation so the grid's
// first paint renders icons from cache.
const INITIAL_ICON_PRELOAD_COUNT = 88;

export interface IconPickerDialogProps {
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
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [query, setQuery] = useState('');
  const [isGridReady, setIsGridReady] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(FALLBACK_VIEWPORT_HEIGHT_PX);
  const [loadedPickerIcons, setLoadedPickerIcons] = useState<readonly LucidePickerIcon[] | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMobileGrid = useIsMobile({ breakpoint: 'sm' });
  const resolvedOpen = open ?? internalOpen;

  const resolvedTitle = title ?? 'Choose icon';
  const resolvedSearchPlaceholder = searchPlaceholder ?? 'Search for icon';
  const resolvedEmptyMessage = emptyMessage ?? 'No icons found';
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '-');
  const pickerIcons: readonly LucidePickerIcon[] = icons
    ? icons.filter(isPlausibleLucideIconName).map((name) => ({ name, aliases: [] }))
    : (loadedPickerIcons ?? []);
  const isCatalogLoading = !icons && loadedPickerIcons === null;
  // Search matches the canonical name or any of its deprecated aliases, so a
  // query like 'home' still finds 'house'.
  const filteredIcons = pickerIcons.filter(
    ({ name, aliases }) => name.includes(normalizedQuery) || aliases.some((alias) => alias.includes(normalizedQuery)),
  );
  const columnCount = isMobileGrid ? MOBILE_COLUMN_COUNT : DESKTOP_COLUMN_COUNT;
  const rowCount = Math.ceil(filteredIcons.length / columnCount);
  const firstVisibleRow = Math.max(0, Math.floor(scrollTop / ICON_ROW_HEIGHT_PX) - OVERSCAN_ROW_COUNT);
  const lastVisibleRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / ICON_ROW_HEIGHT_PX) + OVERSCAN_ROW_COUNT,
  );
  const virtualIcons = isGridReady
    ? filteredIcons.slice(firstVisibleRow * columnCount, lastVisibleRow * columnCount)
    : [];
  // `- 16` trims the trailing `gap-y-4` after the last row.
  const virtualGridHeight = rowCount > 0 ? rowCount * ICON_ROW_HEIGHT_PX - 16 : 0;
  const virtualGridOffset = firstVisibleRow * ICON_ROW_HEIGHT_PX;

  // Load the lazily-chunked catalog the first time the dialog opens without
  // an explicit icon list.
  useEffect(() => {
    if (!resolvedOpen || icons || loadedPickerIcons) return;

    let cancelled = false;
    void loadLucidePickerIcons().then((entries) => {
      if (!cancelled) setLoadedPickerIcons(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedOpen, icons, loadedPickerIcons]);

  useEffect(() => {
    if (!resolvedOpen) return;
    const names = icons ? icons.filter(isPlausibleLucideIconName) : (loadedPickerIcons ?? []).map((icon) => icon.name);
    preloadLucideIcons(names.slice(0, INITIAL_ICON_PRELOAD_COUNT));
  }, [resolvedOpen, icons, loadedPickerIcons]);

  useEffect(() => {
    if (!resolvedOpen) {
      setIsGridReady(false);
      return;
    }

    // Reduced-motion and test environments may not emit animationend.
    const fallbackTimer = window.setTimeout(() => {
      setIsGridReady(true);
    }, OPEN_ANIMATION_FALLBACK_MS);

    return () => window.clearTimeout(fallbackTimer);
  }, [resolvedOpen]);

  useEffect(() => {
    if (!resolvedOpen) return;

    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    const updateViewportHeight = () => {
      setViewportHeight(scrollArea.clientHeight || FALLBACK_VIEWPORT_HEIGHT_PX);
    };

    updateViewportHeight();

    if (typeof ResizeObserver === 'undefined') return;

    const resizeObserver = new ResizeObserver(updateViewportHeight);
    resizeObserver.observe(scrollArea);
    return () => resizeObserver.disconnect();
  }, [resolvedOpen]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setScrollTop(0);
      setIsGridReady(false);
    }
    onOpenChange?.(nextOpen);
  };

  const handleSelect = (iconName: string) => {
    onSelect(iconName);
    handleOpenChange(false);
  };

  const handleDialogAnimationEnd = () => {
    if (!resolvedOpen) return;
    setIsGridReady(true);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const handleQueryChange = (nextQuery: string) => {
    setQuery(nextQuery);
    setScrollTop(0);
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
        className="flex h-110 w-145 max-w-[calc(100vw-2rem)] flex-col gap-6 overflow-hidden p-6 sm:max-w-145 sm:p-8"
        data-testid="icon-picker-dialog-content"
        onClick={(event) => event.stopPropagation()}
        onAnimationEnd={handleDialogAnimationEnd}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{resolvedTitle}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Label htmlFor="icon-picker-search" className="sr-only">
          {resolvedSearchPlaceholder}
        </Label>
        <div className="relative shrink-0">
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
        </div>

        <div
          ref={scrollAreaRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
          onScroll={handleScroll}
          data-testid="icon-picker-scroll-area"
          aria-busy={filteredIcons.length > 0 && !isGridReady ? true : undefined}
        >
          {isCatalogLoading ? (
            <div className="h-full" data-testid="icon-picker-loading" />
          ) : filteredIcons.length === 0 ? (
            <p
              className="flex h-full items-center justify-center text-sm text-muted-foreground"
              data-testid="icon-picker-empty"
            >
              {resolvedEmptyMessage}
            </p>
          ) : isGridReady ? (
            <div className="relative" style={{ height: virtualGridHeight }} data-testid="icon-picker-virtual-space">
              <div
                className="absolute inset-x-0 top-0 grid grid-cols-6 gap-x-2 gap-y-4 sm:grid-cols-11"
                style={{ transform: `translateY(${virtualGridOffset}px)` }}
                data-testid="icon-picker-grid"
              >
                {virtualIcons.map(({ name: iconName }) => {
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
              </div>
            </div>
          ) : (
            <div className="h-full" data-testid="icon-picker-loading" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
