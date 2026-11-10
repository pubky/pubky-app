'use client';

import { Container } from '@/atoms/Container/Container';
import { POST_TAGS_MAX_LENGTH, POST_TAGS_MAX_TOTAL_CHARS, TAG_INPUT_WIDTH_DEFAULT } from '@/config/tags';
import { useEnrichedTags } from '@/hooks/useEnrichedTags/useEnrichedTags';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import type { TMergedTag } from '@/hooks/useOtherLinkTags/useOtherLinkTags.types';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import type { UseResourceTagsResult } from '@/hooks/useResourceTags/useResourceTags.types';
import { canonicalizeTagLabel, generateRandomColor, getDisplayTags } from '@/libs/utils/utils';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { PostTagAddButton } from '@/molecules/PostTagAddButton/PostTagAddButton';
import { PostTagPopoverWrapper } from '@/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper';
import type { TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { TaggedList } from '@/molecules/TaggedList/TaggedList';
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
  /**
   * The tags of the same thing's other links (the resource page's, `mergeOtherLinkTags`): a chip
   * whose label is also there says so in its name, and that row leaves the label out.
   */
  otherTags?: readonly TMergedTag[];
}

/**
 * The tags people put on an external resource, like a post's tag list: the app's tag chips (label
 * and count, the viewer's own highlighted, tagger avatars on hover), each toggling the viewer's
 * tag. Like the post footer it shows the first few tags that fit the post's budget, then "+" to add
 * one; expanded (the Tags button) it is the post's tags panel (`PostTagsPanel`): the tag input on top,
 * then every tag on its own line with its search button and taggers. With no tags yet only "+"
 * shows. Signed out, every write asks to sign in. On the resource page a chip whose label people
 * also put on the same thing's other links says so in its name (`otherTags`).
 */
export function ResourceTagBar({
  resourceTags,
  label,
  id,
  isExpanded,
  isAdding,
  onAddingChange,
  otherTags = [],
}: ResourceTagBarProps) {
  const { isAuthenticated, requireAuth } = useRequireAuth();
  // As on the post: expanding must not pop the phone's keyboard, only "+" focuses the input there.
  const isMobile = useIsMobile();
  const { tags, addTag, toggleTag } = resourceTags;
  const { enrichedTags } = useEnrichedTags(
    tags.map((tag): TagWithAvatars => ({ ...tag, taggers: tag.taggers.map((id) => ({ id })) })),
  );
  const viewerTags = tags.filter((tag) => tag.relationship);

  if (isExpanded) {
    // `PostTagsPanel`'s layout and parts. The input stays until the Tags button collapses the tags.
    return (
      <Container
        id={id}
        role="group"
        aria-label={label}
        data-testid="resource-tag-bar"
        className="min-w-0 flex-1 gap-2"
      >
        <Container overrideDefaults className="flex w-fit max-w-full flex-col gap-2">
          <TagInput
            onTagAdd={addTag}
            existingTags={tags}
            viewerTags={viewerTags}
            disabled={!isAuthenticated}
            onClick={isAuthenticated ? undefined : () => requireAuth(() => undefined)}
            currentTagsCount={tags.length}
            enableApiSuggestions={isAuthenticated}
            excludeFromApiSuggestions={tags.map((tag) => tag.label)}
            addOnSuggestionClick
            autoFocus={isAuthenticated && !isMobile}
          />
          {tags.length > 0 && (
            <Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
              <TaggedList tags={enrichedTags} onTagToggle={(tag) => requireAuth(() => void toggleTag(tag))} />
            </Container>
          )}
        </Container>
      </Container>
    );
  }
  const displayLabels = getDisplayTags(
    enrichedTags.map((tag) => tag.label),
    { maxTagLength: POST_TAGS_MAX_LENGTH, maxTotalChars: POST_TAGS_MAX_TOTAL_CHARS },
  );
  const visibleTags = enrichedTags.filter((tag) => displayLabels.includes(tag.label));
  const elsewhere = new Map(otherTags.map((tag) => [tag.label, tag]));

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
            aria-label={getAlsoOnLabel(tag.label, tag.taggers_count, elsewhere.get(canonicalizeTagLabel(tag.label)))}
            onClick={() => requireAuth(() => void toggleTag(tag))}
          />
        </PostTagPopoverWrapper>
      ))}
      <TagInputToggle
        showInput={isAdding}
        widthByState={{ input: TAG_INPUT_WIDTH_DEFAULT, addButton: 34 }}
        inputContent={
          <TagInput
            // As on the post, the input stays open after an add (TagInput clears it) for the next tag.
            onTagAdd={addTag}
            existingTags={tags}
            viewerTags={viewerTags}
            showCloseButton={isAuthenticated}
            onClose={() => onAddingChange(false)}
            onBlur={() => onAddingChange(false)}
            disabled={!isAuthenticated}
            onClick={isAuthenticated ? undefined : () => requireAuth(() => undefined)}
            currentTagsCount={tags.length}
            enableApiSuggestions={isAuthenticated}
            excludeFromApiSuggestions={tags.map((tag) => tag.label)}
            addOnSuggestionClick
            autoFocus={isAuthenticated}
            containerVariant="plain"
            className="w-full shrink-0"
          />
        }
        addButtonContent={<PostTagAddButton variant="plain" onClick={() => requireAuth(() => onAddingChange(true))} />}
      />
    </Container>
  );
}

/** A chip's name when its label is on other services too: the post tag's own name, then where. */
function getAlsoOnLabel(label: string, count: number, elsewhere: TMergedTag | undefined): string | undefined {
  if (!elsewhere) return undefined;
  const services = elsewhere.sources.map((source) => source.name).join(', ');
  return `${label} tag (${count} posts), also on ${services}`;
}
