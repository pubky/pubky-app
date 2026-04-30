'use client';

import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { useEntityTags } from '@/hooks/useEntityTags/useEntityTags';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import * as React from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import type { ClickableTagsListProps } from './ClickableTagsList.types';
import { cn, generateRandomColor, getDisplayTags } from '@/libs/utils/utils';

import {
  CLICKABLE_TAGS_DEFAULT_MAX_LENGTH,
  CLICKABLE_TAGS_DEFAULT_MAX_TOTAL_CHARS,
  TAG_INPUT_WIDTH_AT_LIMIT,
  TAG_INPUT_WIDTH_DEFAULT,
} from '@/config';
import { TagKind } from '@/application/tag/tag.types';
import { useAuthStore } from '@/stores/auth/auth.store';
/**
 * ClickableTagsList
 *
 * A unified component for displaying clickable tags that can be toggled (add/remove tagger).
 * Works for both USER and POST tags.
 *
 * Features:
 * - Shows outline when current user is a tagger
 * - Click to toggle (add/remove) tag
 * - Smart limiting based on character budget
 * - Automatic fetching from IndexedDB if tags not provided
 * - Optional input for adding new tags
 * - Optional add button
 * - Optional close button on tags
 *
 * For unauthenticated users:
 * - All UI elements are visible
 * - Any click opens sign-in dialog (following pubky-app pattern)
 */
export function ClickableTagsList({
  taggedId,
  taggedKind,
  tags: providedTags,
  maxTags,
  maxTagLength = CLICKABLE_TAGS_DEFAULT_MAX_LENGTH,
  maxTotalChars = CLICKABLE_TAGS_DEFAULT_MAX_TOTAL_CHARS,
  showCount = true,
  showInput = false,
  showAddButton = false,
  addMode = false,
  showTagClose = false,
  className,
  onTagClick,
  onTagClose,
  onTagAdd,
  onAddButtonClick,
}: ClickableTagsListProps) {
  // State for add mode input visibility
  const [isAdding, setIsAdding] = React.useState(addMode ? false : showInput);

  // Auth requirement for tag actions
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const setShowSignInDialog = useAuthStore((state) => state.setShowSignInDialog);

  // Use unified entity tags hook
  const {
    tags: fetchedTags,
    isViewerTagger,
    handleTagToggle,
    handleTagAdd,
  } = useEntityTags(taggedId, taggedKind, { providedTags });

  // Enrich tags with user details for proper avatar fallbacks
  const { enrichedTags } = useEnrichedTags(fetchedTags);

  // Determine if input should be shown
  const hasInput = showInput || isAdding;
  const isAtLimit = maxTags ? enrichedTags.length >= maxTags : false;
  const inputWidth = isAtLimit ? TAG_INPUT_WIDTH_AT_LIMIT : TAG_INPUT_WIDTH_DEFAULT;

  // Get viewer's own tags for duplicate checking
  // This allows adding a tag that others have used but the viewer hasn't
  const viewerTags = enrichedTags.filter((t) => isViewerTagger(t));

  // Handle tag add from input
  const handleTagAddFromInput = (label: string) => {
    if (onTagAdd) {
      onTagAdd(label);
    } else {
      void handleTagAdd(label);
    }
    if (!addMode) {
      setIsAdding(false);
    }
  };

  // Handle tag click with auth requirement (toggle or custom handler)
  const handleTagClick = (tag: (typeof enrichedTags)[number], index: number, e: React.MouseEvent) => {
    requireAuth(() => {
      if (onTagClick) {
        onTagClick(tag, index, e);
      } else {
        void handleTagToggle(tag);
      }
    });
  };

  // Handle input blur - close input in addMode when empty
  const handleInputBlur = () => {
    if (addMode) setIsAdding(false);
  };

  const handleInputClose = () => {
    if (addMode) setIsAdding(false);
  };

  // Apply smart limiting based on character budget
  const tagLabels = enrichedTags.map((tag) => tag.label);
  const displayLabels = getDisplayTags(tagLabels, {
    maxTagLength,
    maxTotalChars,
    maxCount: maxTags,
  });
  const visibleTags = enrichedTags.filter((tag) => displayLabels.includes(tag.label));

  // Check if we should render anything
  const hasVisibleTags = visibleTags.length > 0;
  const hasAddButton = showAddButton && !showInput && !isAdding;

  if (!hasVisibleTags && !hasInput && !hasAddButton) return null;

  // Handle add button click with auth requirement
  const handleAddButtonClick = () => {
    requireAuth(() => {
      onAddButtonClick?.();
      if (addMode) setIsAdding(true);
    });
  };

  // For unauthenticated users, clicking input opens sign-in dialog
  const handleInputClick = !isAuthenticated ? () => setShowSignInDialog(true) : undefined;

  return (
    <Atoms.Container overrideDefaults className="flex flex-col gap-1">
      <Atoms.Container
        overrideDefaults
        data-cy="clickable-tags-list"
        className={cn('flex flex-wrap items-center gap-2', className)}
      >
        {/* Render existing tags with hover popover for tagger avatars */}
        {visibleTags.map((tag, index) => (
          <Molecules.PostTagPopoverWrapper
            key={`${taggedId}-${tag.label}`}
            taggers={tag.taggers}
            taggersCount={tag.taggers_count}
            postId={taggedKind === TagKind.POST ? taggedId : null}
            tagLabel={tag.label}
          >
            <Molecules.PostTag
              label={tag.label}
              count={showCount ? tag.taggers_count : undefined}
              color={generateRandomColor(tag.label)}
              selected={isViewerTagger(tag)}
              showClose={showTagClose}
              onClick={(e) => handleTagClick(tag, index, e)}
              onClose={(e) => onTagClose?.(tag, index, e)}
            />
          </Molecules.PostTagPopoverWrapper>
        ))}

        {/* Add tag input / add button switch with shared animation */}
        {(hasInput || hasAddButton) && (
          <Molecules.TagInputToggle
            showInput={hasInput}
            widthByState={{ input: inputWidth, addButton: 34 }}
            inputContent={
              <Molecules.TagInput
                onTagAdd={handleTagAddFromInput}
                existingTags={enrichedTags}
                viewerTags={viewerTags}
                showCloseButton={addMode && !showInput && isAuthenticated}
                onClose={handleInputClose}
                disabled={!isAuthenticated}
                maxTags={maxTags}
                currentTagsCount={enrichedTags.length}
                onBlur={handleInputBlur}
                onClick={handleInputClick}
                enableApiSuggestions={isAuthenticated}
                excludeFromApiSuggestions={enrichedTags.map((t) => t.label)}
                addOnSuggestionClick={true}
                autoFocus={isAuthenticated && isAdding}
                containerVariant="plain"
                className="w-full shrink-0"
              />
            }
            addButtonContent={
              hasAddButton ? <Molecules.PostTagAddButton variant="plain" onClick={handleAddButtonClick} /> : null
            }
          />
        )}
      </Atoms.Container>
    </Atoms.Container>
  );
}
