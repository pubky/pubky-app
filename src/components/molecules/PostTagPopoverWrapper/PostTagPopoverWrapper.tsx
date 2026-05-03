'use client';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostTaggers } from '@/hooks/usePostTaggers/usePostTaggers';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { WhoTaggedExpandedList } from '../WhoTaggedExpandedList/WhoTaggedExpandedList';

import type { PostTagPopoverWrapperProps } from './PostTagPopoverWrapper.types';
import { POPOVER_HOVER_DELAY, MAX_VISIBLE_AVATARS } from './PostTagPopoverWrapper.constants';
import { TaggerAvatar } from './TaggerAvatar/TaggerAvatar';

/**
 * PostTagPopoverWrapper
 *
 * Wraps a tag with hover tooltip showing tagger avatars.
 * Click on avatar opens user profile popover.
 * Click on overflow counter (+N) opens full taggers list.
 *
 * Note: Hover tooltip is desktop-only to avoid unintended
 * popover activation on mobile tap interactions.
 */
export function PostTagPopoverWrapper({
  taggers,
  taggersCount,
  postId,
  tagLabel,
  children,
}: PostTagPopoverWrapperProps) {
  const [open, setOpen] = useState(false);
  const [showAllTaggers, setShowAllTaggers] = useState(false);
  const isMobile = useIsMobile();
  const shouldFetchTaggers = Boolean(postId && tagLabel);
  const { taggersByLabel, taggerStates, fetchAllTaggers } = usePostTaggers(shouldFetchTaggers ? postId : null);
  const initialTaggerIds = useMemo(() => taggers.map((tagger) => tagger.id), [taggers]);
  const labelKey = tagLabel?.toLowerCase();
  const expandedTaggerIds = labelKey ? taggersByLabel.get(labelKey) : undefined;
  const isLoadingTaggers = labelKey ? (taggerStates.get(labelKey)?.isLoading ?? false) : false;

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // When hover popover closes, also close the "all taggers" dropdown
    if (!newOpen) {
      setShowAllTaggers(false);
    }
  };

  useEffect(() => {
    if (!showAllTaggers || !shouldFetchTaggers || !tagLabel) return;
    void fetchAllTaggers(tagLabel, initialTaggerIds, taggersCount);
  }, [showAllTaggers, shouldFetchTaggers, tagLabel, initialTaggerIds, taggersCount, fetchAllTaggers]);

  // On mobile or when no taggers, just render children without popover
  if (isMobile || (taggers.length === 0 && taggersCount === 0)) {
    return <>{children}</>;
  }

  const visibleTaggers = taggers.slice(0, MAX_VISIBLE_AVATARS);
  const overflowCount = Math.max(0, taggersCount - visibleTaggers.length);

  return (
    <Popover hover hoverDelay={POPOVER_HOVER_DELAY} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        sideOffset={4}
        align="start"
        className="w-auto border-none bg-transparent p-0 shadow-none"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Container overrideDefaults className="flex items-center">
          {visibleTaggers.map((tagger, index) => (
            <TaggerAvatar key={tagger.id} tagger={tagger} index={index} />
          ))}
          {overflowCount > 0 && (
            <Popover open={showAllTaggers} onOpenChange={setShowAllTaggers}>
              <PopoverTrigger asChild>
                <Button
                  overrideDefaults
                  className="z-0 -ml-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-medium shadow-sm transition-opacity hover:opacity-80"
                  aria-label={`Show all ${taggersCount} taggers`}
                >
                  +{overflowCount}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="bottom"
                sideOffset={8}
                align="start"
                className="w-auto p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {showAllTaggers && (
                  <WhoTaggedExpandedList
                    taggerIds={expandedTaggerIds ?? initialTaggerIds}
                    fallbackTaggers={taggers}
                    isLoadingTaggers={isLoadingTaggers}
                  />
                )}
              </PopoverContent>
            </Popover>
          )}
        </Container>
      </PopoverContent>
    </Popover>
  );
}
