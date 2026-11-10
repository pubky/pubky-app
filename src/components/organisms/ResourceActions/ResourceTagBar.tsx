'use client';

import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS, TAG_INPUT_WIDTH_DEFAULT } from '@/config/tags';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { UseResourceTagsResult } from '@/hooks/useResourceTags/useResourceTags.types';
import { generateRandomColor, getDisplayTags } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { PostTagAddButton } from '@/molecules/PostTagAddButton/PostTagAddButton';
import { PostTagPopoverWrapper } from '@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { TagInputToggle } from '@/molecules/TagInputToggle/TagInputToggle';

interface ResourceTagBarProps {
  /** The link's tags and the viewer's writes, read once by the zone (its Tags button counts them). */
  resourceTags: UseResourceTagsResult;
  /** Names what is tagged ("Tags on this video"): the list's accessible name, not shown. */
  label: string;
  /** The list's id, for the zone's Tags button to point at (`aria-controls`). */
  id?: string;
  /** The zone's Tags button shows every tag and the tag input; otherwise a few tags and "+" show. */
  isExpanded: boolean;
  /** Whether "+" shows the tag input while the tags are not expanded. */
  isAdding: boolean;
  onAddingChange: (isAdding: boolean) => void;
}

/**
 * The tags people put on an external resource, like a post's tag list: the app's tag chips (label
 * and count, the viewer's own highlighted, tagger avatars on hover), each toggling the viewer's
 * tag. Like the post footer it shows the first few tags that fit the post's budget, then "+" to add
 * one; expanded (the Tags button) it shows every tag and the tag input. With no tags yet only "+"
 * shows. Signed out, every write asks to sign in.
 */
export function ResourceTagBar({ resourceTags, label, id, isExpanded, isAdding, onAddingChange }: ResourceTagBarProps) {
  const { isAuthenticated, requireAuth } = useRequireAuth();
  // As on the post: expanding must not pop the phone's keyboard, only "+" focuses the input there.
  const isMobile = useIsMobile();
  const { tags, addTag, toggleTag } = resourceTags;
  const { enrichedTags } = useEnrichedTags(
    tags.map((tag): TagWithAvatars => ({ ...tag, taggers: tag.taggers.map((id) => ({ id })) })),
  );
  const viewerTags = tags.filter((tag) => tag.relationship);
  const displayLabels = getDisplayTags(
    enrichedTags.map((tag) => tag.label),
    { maxTagLength: POST_TAGS_MAX_LENGTH, maxTotalChars: POST_TAGS_MAX_TOTAL_CHARS },
  );
  const visibleTags = isExpanded ? enrichedTags : enrichedTags.filter((tag) => displayLabels.includes(tag.label));
  const showInput = isExpanded || isAdding;

  return (
    <Container
      overrideDefaults
      id={id}
      role="group"
      aria-label={label}
      data-testid="resource-tag-bar"
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      {visibleTags.map((tag) => (
        <PostTagPopoverWrapper
          key={tag.label}
          taggers={tag.taggers}
          taggersCount={tag.taggers_count}
          postId={null}
          tagLabel={tag.label}
        >
          <PostTag
            label={tag.label}
            count={tag.taggers_count}
            color={generateRandomColor(tag.label)}
            selected={tag.relationship}
            onClick={() => requireAuth(() => void toggleTag(tag))}
          />
        </PostTagPopoverWrapper>
      ))}
      <TagInputToggle
        showInput={showInput}
        widthByState={{ input: TAG_INPUT_WIDTH_DEFAULT, addButton: 34 }}
        inputContent={
          <TagInput
            // As on the post, the input stays open after an add (TagInput clears it) for the next tag.
            onTagAdd={addTag}
            existingTags={tags}
            viewerTags={viewerTags}
            // Expanded, the input stays until the Tags button collapses the tags again.
            showCloseButton={!isExpanded}
            onClose={() => onAddingChange(false)}
            onBlur={() => onAddingChange(false)}
            disabled={!isAuthenticated}
            onClick={isAuthenticated ? undefined : () => requireAuth(() => undefined)}
            currentTagsCount={tags.length}
            enableApiSuggestions={isAuthenticated}
            excludeFromApiSuggestions={tags.map((tag) => tag.label)}
            addOnSuggestionClick
            autoFocus={isAuthenticated && (isAdding || !isMobile)}
            containerVariant="plain"
            className="w-full shrink-0"
          />
        }
        addButtonContent={<PostTagAddButton variant="plain" onClick={() => requireAuth(() => onAddingChange(true))} />}
      />
    </Container>
  );
}
