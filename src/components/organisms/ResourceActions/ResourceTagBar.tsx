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
import { getLinkHost } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceSourceIcon } from '@/molecules/ResourceCard/ResourceSourceIcon';
import type { TaggerWithAvatar, TagWithAvatars } from '@/molecules/TaggedItem/TaggedItem.types';
import { TaggedList } from '@/molecules/TaggedList/TaggedList';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { TagInputToggle } from '@/molecules/TagInputToggle/TagInputToggle';
import { WhoTaggedExpandedList } from '@/molecules/WhoTaggedExpandedList/WhoTaggedExpandedList';
import { getTagPeople, MAX_OTHER_TAGS, type TTagPeople, type TTagPerson } from './ResourceTagBar.utils';

/** The two groups of a tag's detail, for screen readers only. */
const TAG_PEOPLE_GROUPS = ['Tagged on this link', 'Tagged only on other services'] as const;

interface ResourceTagBarProps {
  /** The link's tags and the viewer's writes, read once by the zone (its Tags button counts them). */
  resourceTags: UseResourceTagsResult;
  /** Names what is tagged ("Tags on this video"): the list's accessible name, not shown. */
  label: string;
  /** The list's id, for the zone's Tags button to point at (`aria-controls`). */
  id?: string;
  /** The link the tags are on: its icon marks who tagged it here in a tag's detail (`otherTags`). */
  uri?: string;
  /** The zone's Tags button shows every tag and the tag input; otherwise a few tags and "+" show. */
  isExpanded: boolean;
  /** Whether "+" shows the tag input while the tags are not expanded. */
  isAdding: boolean;
  onAddingChange: (isAdding: boolean) => void;
  /**
   * The tags of the same thing's other links (the resource page's, `mergeOtherLinkTags`), merged
   * into the list: an own chip counts the people across them too, the labels only they have follow
   * as secondary chips.
   */
  otherTags?: readonly TMergedTag[];
}

/**
 * The tags people put on an external resource, like a post's tag list: the app's tag chips (label
 * and count, the viewer's own highlighted, tagger avatars on hover), each toggling the viewer's
 * tag. Like the post footer it shows the first few tags that fit the post's budget, then "+" to add
 * one; expanded (the Tags button) it is the post's tags panel (`PostTagsPanel`): the tag input on top,
 * then every tag on its own line with its search button and taggers. With no tags yet only "+"
 * shows. Signed out, every write asks to sign in.
 *
 * On the resource page the same thing's other links' tags join the one list (`otherTags`): the
 * link's own tags first, a label also on other services with the people across all of them muted
 * after its count ("5 (10)"); then, in the places the own tags leave free (all of them once
 * expanded), the labels only other services have as secondary chips, most popular first: a press
 * adds the tag here. Such a tag's detail (hover, or its taggers once expanded) lists each person
 * once, the people who tagged this link first, each with the icons of the links they tagged.
 */
export function ResourceTagBar({
  resourceTags,
  label,
  id,
  uri,
  isExpanded,
  isAdding,
  onAddingChange,
  otherTags = [],
}: ResourceTagBarProps) {
  const { isAuthenticated, requireAuth } = useRequireAuth();
  // As on the post: expanding must not pop the phone's keyboard, only "+" focuses the input there.
  const isMobile = useIsMobile();
  const { tags, addTag, toggleTag } = resourceTags;
  const elsewhere = new Map(otherTags.map((tag) => [tag.label, tag]));
  const ownLabels = new Set(tags.map((tag) => canonicalizeTagLabel(tag.label)));
  const peopleOf = (tag: Pick<TagWithAvatars, 'label' | 'isSecondary'>): TTagPeople | undefined => {
    const other = elsewhere.get(canonicalizeTagLabel(tag.label));
    if (!other) return undefined;
    return getTagPeople(tag.isSecondary ? undefined : tags.find((own) => own.label === tag.label), other);
  };
  const { enrichedTags } = useEnrichedTags([
    ...tags.map((tag): TagWithAvatars => {
      const people = peopleOf(tag);
      if (!people) return { ...tag, taggers: tag.taggers.map((tagger) => ({ id: tagger })) };
      // The total shows only when it adds people (one person on two services is counted once).
      const total = people.total > tag.taggers_count ? people.total : undefined;
      return { ...tag, taggers: [...people.here, ...people.elsewhere].map(({ id }) => ({ id })), total };
    }),
    ...otherTags
      .filter((tag) => !ownLabels.has(tag.label))
      .slice(0, MAX_OTHER_TAGS)
      .map((tag): TagWithAvatars => ({
        label: tag.label,
        taggers: tag.taggers.map((tagger) => ({ id: tagger })),
        taggers_count: tag.count,
        relationship: false,
        tag_uri: null,
        isSecondary: true,
      })),
  ]);
  const viewerTags = tags.filter((tag) => tag.relationship);
  // An own chip toggles the viewer's tag; a secondary one adds it to this link (it then is an own chip).
  const pressTag = (tag: TagWithAvatars) =>
    requireAuth(() => void (tag.isSecondary ? addTag(tag.label) : toggleTag(tag)));
  const renderPeople = (tag: TagWithAvatars) => {
    const people = peopleOf(tag);
    return people && <TagPeople people={people} uri={uri} taggers={tag.taggers} />;
  };

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
          {enrichedTags.length > 0 && (
            <Container overrideDefaults className="max-h-80 overflow-x-hidden overflow-y-auto pr-1">
              <TaggedList tags={enrichedTags} onTagToggle={pressTag} renderExpandedTaggers={renderPeople} />
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
          taggersCount={tag.total ?? tag.taggers_count}
          postId={null}
          tagLabel={tag.label}
          content={renderPeople(tag)}
        >
          <PostTag
            label={tag.label}
            count={tag.taggers_count}
            total={tag.total}
            variant={tag.isSecondary ? 'secondary' : 'default'}
            color={generateRandomColor(tag.label)}
            selected={tag.relationship}
            aria-label={getChipLabel(tag, peopleOf(tag))}
            onClick={() => pressTag(tag)}
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

/**
 * A chip's name when its label is on other services: how many here and across them (an own chip),
 * or how many on other services and that a press adds it here (a secondary chip). Otherwise the
 * post tag's own name.
 */
function getChipLabel(tag: TagWithAvatars, people: TTagPeople | undefined): string | undefined {
  if (!people) return undefined;
  const atLeast = people.isComplete ? '' : 'at least ';
  if (tag.isSecondary) return `${tag.label}, ${atLeast}${people.total} on other services, add it here`;
  return `${tag.label}, ${tag.taggers_count} here, ${atLeast}${people.total} across services`;
}

/**
 * Who put a tag on the link and on the same thing's other links (`getTagPeople`), in the app's who
 * tagged list: the people who tagged this link, a thin rule, the people who tagged it only
 * elsewhere, each row ending in the icons of the links they tagged (this one first). "+N" for the
 * people Nexus counts but does not list.
 */
function TagPeople({ people, uri, taggers }: { people: TTagPeople; uri?: string; taggers: TaggerWithAvatar[] }) {
  const byId = new Map([...people.here, ...people.elsewhere].map((person) => [person.id, person]));
  const isHere = new Set(people.here.map((person) => person.id));
  return (
    <WhoTaggedExpandedList
      taggerIds={people.here.map((person) => person.id)}
      secondaryTaggerIds={people.elsewhere.map((person) => person.id)}
      groupNames={TAG_PEOPLE_GROUPS}
      fallbackTaggers={taggers}
      moreCount={people.total - byId.size}
      renderTaggerAside={(taggerId) => (
        <TaggerLinks links={byId.get(taggerId)?.links ?? []} isHere={isHere.has(taggerId)} uri={uri} />
      )}
      data-testid="resource-tag-people"
    />
  );
}

/** The icons of the links one person put a tag on: this link's first, each service once. */
function TaggerLinks({ links, isHere, uri }: { links: TTagPerson['links']; isHere: boolean; uri?: string }) {
  // Another spelling on this link's own site (a second Spotify link) shows no second icon.
  const hereHost = isHere && uri ? getLinkHost(uri) : null;
  const others = hereHost ? links.filter((link) => getLinkHost(link.uri) !== hereHost) : links;
  const shown = others.filter((link, index) => others.findIndex((other) => other.name === link.name) === index);
  const where = shown.map((link) => link.name).join(', ');
  const text = isHere ? (where ? `Tagged here and on ${where}` : 'Tagged here') : `Tagged on ${where}`;
  return (
    <Container overrideDefaults className="flex shrink-0 items-center gap-1" data-testid="resource-tagger-links">
      {isHere && uri && <ResourceSourceIcon uri={uri} />}
      {shown.map((link) => (
        <ResourceSourceIcon key={link.uri} uri={link.uri} />
      ))}
      <span className="sr-only">{text}</span>
    </Container>
  );
}
