'use client';

import { type ComponentType, type ReactNode, useEffect } from 'react';
import {
  Check,
  CirclePlay,
  Columns3,
  Download,
  Flame,
  Image,
  Layers,
  LayoutGrid,
  Library,
  Link,
  Newspaper,
  Rows2,
  Rows4,
  SquareAsterisk,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { Controller, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { DynamicLucideIcon } from '@/atoms/DynamicLucideIcon/DynamicLucideIcon';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { useControlledState } from '@/hooks/useControlledState/useControlledState';
import { useCustomFeedForm } from '@/hooks/useCustomFeedForm/useCustomFeedForm';
import {
  CUSTOM_FEED_CONTENT_ALL,
  CUSTOM_FEED_FORM_FIELDS,
  type CustomFeedFormContent,
  type CustomFeedFormReach,
} from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { IconPickerDialog } from '@/organisms/IconPickerDialog/IconPickerDialog';
import { type ReachFilterValue } from '@/stores/home/home.types';
import { HOME_PROFILE_TAGS_MAX_SELECTED } from '@/stores/home/home.types';
import { pubkyReachToHomeReach } from '@/utils/pubky-app-spec-feed-mappers';

interface CustomFeedDialogSharedProps {
  /** Trigger element; omit when the dialog is driven via `open`/`onOpenChange`. */
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type CustomFeedDialogProps =
  | (CustomFeedDialogSharedProps & {
      mode: 'create';
      feed?: never;
    })
  | (CustomFeedDialogSharedProps & {
      mode: 'edit';
      feed: FeedModelSchema;
    });

function isVisualCustomFeedContentSupported(content?: CustomFeedFormContent): boolean {
  return (
    content === CUSTOM_FEED_CONTENT_ALL || content === PubkyAppPostKind.Image || content === PubkyAppPostKind.Video
  );
}

function parseReachValue(value: string): CustomFeedFormReach {
  return value === TAGGED_AS_FILTER_KEY ? TAGGED_AS_FILTER_KEY : (Number(value) as PubkyAppFeedReach);
}

/** Shown for a stored reach/content this dialog cannot offer as a choice. */
const UNSUPPORTED_OPTION_LABEL = 'Unsupported (set elsewhere)';

const REACH_OPTION_VALUES: CustomFeedFormReach[] = [
  PubkyAppFeedReach.Wot,
  TAGGED_AS_FILTER_KEY,
  PubkyAppFeedReach.Following,
  PubkyAppFeedReach.Friends,
  PubkyAppFeedReach.Me,
  PubkyAppFeedReach.All,
];

export const CustomFeedDialog = (props: CustomFeedDialogProps) => {
  const { mode, children } = props;
  const { value: open, setValue: setOpen } = useControlledState<boolean>({
    value: props.open,
    defaultValue: false,
    onChange: props.onOpenChange,
  });
  // Read `feed` off `props` rather than destructuring it: the props union ties
  // `feed` to `mode`, and destructuring erases that link for TS.
  const { form, loading, submit, deleteFeed } = useCustomFeedForm(
    props.mode === 'edit' ? { mode: 'edit', feed: props.feed, open } : { mode: 'create', open },
  );

  const { control } = form;
  const layout = useWatch({ control, name: CUSTOM_FEED_FORM_FIELDS.LAYOUT });
  const content = useWatch({ control, name: CUSTOM_FEED_FORM_FIELDS.CONTENT });
  const reach = useWatch({ control, name: CUSTOM_FEED_FORM_FIELDS.REACH });
  const domainTags = useWatch({ control, name: CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS }) ?? [];

  const isTaggedAsReach = reach === TAGGED_AS_FILTER_KEY;
  const isAtProfileTagLimit = domainTags.length >= HOME_PROFILE_TAGS_MAX_SELECTED;

  // Reach options derive from the shared REACH_FILTER_META so every surface
  // that renders a reach (sidebar filter, feed tab, this dialog) stays in sync.
  const reachFilters = REACH_OPTION_VALUES.flatMap((value) => {
    // A spec reach with no home-store equivalent (e.g. Followers) has no label
    // or icon of its own — drop it rather than defaulting it onto another
    // option's identity, which would render two entries reading the same.
    const metaKey: ReachFilterValue | undefined =
      value === TAGGED_AS_FILTER_KEY ? TAGGED_AS_FILTER_KEY : pubkyReachToHomeReach(value);
    return metaKey ? [{ value, ...REACH_FILTER_META[metaKey] }] : [];
  });
  const sortFilters = [
    {
      value: PubkyAppFeedSort.Recent,
      label: 'Recent',
      icon: SquareAsterisk,
    },
    {
      value: PubkyAppFeedSort.Popularity,
      label: 'Popularity',
      icon: Flame,
    },
  ];
  const layoutFilters = [
    {
      value: PubkyAppFeedLayout.Columns,
      label: 'Columns',
      icon: Columns3,
    },
    {
      value: PubkyAppFeedLayout.Wide,
      label: 'Wide',
      icon: Rows2,
    },
    {
      value: PubkyAppFeedLayout.Visual,
      label: 'Visual',
      icon: LayoutGrid,
    },
    {
      value: PubkyAppFeedLayout.List,
      label: 'List',
      icon: Rows4,
    },
  ];
  const allContentFilters: Array<{
    value: CustomFeedFormContent;
    label: string;
    icon: ComponentType;
  }> = [
    {
      value: CUSTOM_FEED_CONTENT_ALL,
      label: 'All',
      icon: Layers,
    },
    {
      value: PubkyAppPostKind.Short,
      label: 'Posts',
      icon: StickyNote,
    },
    {
      value: PubkyAppPostKind.Long,
      label: 'Articles',
      icon: Newspaper,
    },
    {
      value: PubkyAppPostKind.Collection,
      label: 'Collections',
      icon: Library,
    },
    {
      value: PubkyAppPostKind.Image,
      label: 'Images',
      icon: Image,
    },
    {
      value: PubkyAppPostKind.Video,
      label: 'Videos',
      icon: CirclePlay,
    },
    {
      value: PubkyAppPostKind.Link,
      label: 'Links',
      icon: Link,
    },
    {
      value: PubkyAppPostKind.File,
      label: 'Files',
      icon: Download,
    },
  ];
  const contentFilters =
    layout === PubkyAppFeedLayout.Visual
      ? allContentFilters.filter((filter) => isVisualCustomFeedContentSupported(filter.value))
      : allContentFilters;

  // A feed authored elsewhere can hold a reach or content this dialog has no
  // option for (PubkyAppFeedReach.Followers, PubkyAppPostKind.Unknown). Show
  // the value as a disabled entry so the Select reflects what is stored rather
  // than falling back to its placeholder and reading as "nothing selected".
  const unsupportedReach = reachFilters.some((filter) => filter.value === reach) ? null : reach;
  const unsupportedContent = contentFilters.some((filter) => filter.value === content) ? null : content;

  // Catches a stored feed whose layout/content pair another client left in a
  // combination this dialog cannot represent; user-driven layout changes are
  // corrected up-front in `handleLayoutChange`.
  useEffect(() => {
    if (layout !== PubkyAppFeedLayout.Visual) return;
    if (isVisualCustomFeedContentSupported(content)) return;
    form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_ALL, { shouldValidate: true });
  }, [content, layout, form]);

  const handleLayoutChange = (value: string, onChange: (next: PubkyAppFeedLayout) => void) => {
    const nextLayout = Number(value) as PubkyAppFeedLayout;
    onChange(nextLayout);
    if (nextLayout === PubkyAppFeedLayout.Visual && !isVisualCustomFeedContentSupported(content)) {
      form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_ALL, { shouldValidate: true });
    }
  };

  const handleReachChange = (value: string) => {
    const nextReach = parseReachValue(value);
    // setValue (not only Controller.onChange) so useWatch subscribers reliably
    // re-render — needed to reveal the profile-tags section for Tagged as.
    form.setValue(CUSTOM_FEED_FORM_FIELDS.REACH, nextReach, {
      shouldValidate: true,
      shouldDirty: true,
    });
    // Profile tags are authored only via Tagged as. Leaving that surface (or
    // any other explicit reach pick) drops legacy domain tags so they cannot
    // silently persist on an unsupported reach after save.
    if (nextReach !== TAGGED_AS_FILTER_KEY) {
      form.setValue(CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS, [], { shouldValidate: true });
    }
  };

  const handleDomainTagAdd = (tag: string) => {
    const normalizedTag = tag.trim().toLowerCase();
    if (
      !isTaggedAsReach ||
      !normalizedTag ||
      domainTags.length >= HOME_PROFILE_TAGS_MAX_SELECTED ||
      domainTags.some((existingTag) => existingTag.toLowerCase() === normalizedTag)
    ) {
      return;
    }
    form.setValue(CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS, [...domainTags, normalizedTag], {
      shouldValidate: true,
      shouldDirty: true,
    });
  };

  const handleSaveFeed = async () => {
    const saved = await submit();

    if (saved) setOpen(false);
  };
  const handleDeleteFeed = async () => {
    const deleted = await deleteFeed();

    if (deleted) setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && (
        <DialogTrigger asChild data-testid="custom-feed-dialog-trigger">
          {children}
        </DialogTrigger>
      )}

      <DialogContent
        onOpenAutoFocus={(e) => {
          // Edit mode skips the name input's auto-focus, but focus must still
          // enter the modal — leaving it on the now-obscured trigger strands
          // keyboard and screen-reader users outside the dialog.
          if (mode === 'edit') {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-xl"
        data-testid="custom-feed-dialog-content"
      >
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Feed' : 'Edit Feed'}</DialogTitle>
        </DialogHeader>

        <Container className="gap-y-2">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Feed Title'}</Label>

          <Controller
            name={CUSTOM_FEED_FORM_FIELDS.NAME}
            control={control}
            render={({ field }) => (
              <Input
                required
                placeholder={'Name your feed'}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={loading}
                className="h-14 border-dashed"
                data-testid="feed-name-input"
              />
            )}
          />
        </Container>

        <Container className="gap-y-2">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Feed Icon'}</Label>

          <Controller
            name={CUSTOM_FEED_FORM_FIELDS.ICON}
            control={control}
            render={({ field }) => (
              <IconPickerDialog
                value={field.value}
                onSelect={field.onChange}
                title={'Feed Icon'}
                description={
                  mode === 'create' ? 'Choose a custom icon for your new feed.' : 'Choose a custom icon for your feed.'
                }
              >
                <Button
                  type="button"
                  variant="secondary"
                  className="w-fit gap-2 border-transparent px-4 shadow-none"
                  aria-label={'Select icon'}
                  disabled={loading}
                  data-testid="feed-icon-picker-trigger"
                >
                  <DynamicLucideIcon name={field.value} className="size-4 shrink-0" />
                  {'Select icon'}
                </Button>
              </IconPickerDialog>
            )}
          />
        </Container>

        <Container className="flex-wrap gap-x-8 gap-y-4 sm:flex-row">
          <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="reach-filter-section">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Reach'}</Label>

            <Controller
              name={CUSTOM_FEED_FORM_FIELDS.REACH}
              control={control}
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={handleReachChange}
                  disabled={loading}
                  data-testid="reach-select"
                >
                  <SelectTrigger className="w-full sm:w-fit">
                    <SelectValue placeholder={'Select a reach'} />
                  </SelectTrigger>

                  <SelectContent>
                    {unsupportedReach !== null && (
                      <SelectItem disabled value={String(unsupportedReach)}>
                        {UNSUPPORTED_OPTION_LABEL}
                      </SelectItem>
                    )}
                    {reachFilters.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)}>
                        <r.icon /> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Container>

          <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="sort-filter-section">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Sort'}</Label>

            <Controller
              name={CUSTOM_FEED_FORM_FIELDS.SORT}
              control={control}
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                  disabled={loading}
                  data-testid="sort-select"
                >
                  <SelectTrigger className="w-full sm:w-fit">
                    <SelectValue placeholder={'Select a sort'} />
                  </SelectTrigger>

                  <SelectContent>
                    {sortFilters.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)}>
                        <r.icon /> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Container>

          <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="layout-filter-section">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Layout'}</Label>

            <Controller
              name={CUSTOM_FEED_FORM_FIELDS.LAYOUT}
              control={control}
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => handleLayoutChange(v, field.onChange)}
                  disabled={loading}
                  data-testid="layout-select"
                >
                  <SelectTrigger className="w-full sm:w-fit">
                    <SelectValue placeholder={'Select a layout'} />
                  </SelectTrigger>

                  <SelectContent>
                    {layoutFilters.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)}>
                        <r.icon /> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Container>

          <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="content-filter-section">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Content'}</Label>

            <Controller
              name={CUSTOM_FEED_FORM_FIELDS.CONTENT}
              control={control}
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(v === CUSTOM_FEED_CONTENT_ALL ? v : Number(v))}
                  disabled={loading}
                  data-testid="content-select"
                >
                  <SelectTrigger className="w-full sm:w-fit">
                    <SelectValue placeholder={'Select content'} />
                  </SelectTrigger>

                  <SelectContent>
                    {unsupportedContent !== null && (
                      <SelectItem disabled value={String(unsupportedContent)}>
                        {UNSUPPORTED_OPTION_LABEL}
                      </SelectItem>
                    )}
                    {contentFilters.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)}>
                        <r.icon /> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Container>
        </Container>

        <Container className="gap-y-2">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Post Tags'}</Label>

          <Typography overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
            {'Filter by what posts are about.'}
          </Typography>

          <Controller
            name={CUSTOM_FEED_FORM_FIELDS.TAGS}
            control={control}
            render={({ field }) => (
              <>
                <TagInput
                  onTagAdd={(tag) => field.onChange([...field.value, tag])}
                  existingTags={field.value.map((tag) => ({
                    label: tag,
                  }))}
                  showCloseButton={false}
                  disabled={loading}
                  maxTags={getMaxStreamTags()}
                  currentTagsCount={field.value.length}
                  enableApiSuggestions
                  excludeFromApiSuggestions={field.value}
                  addOnSuggestionClick
                  className="w-48"
                  data-testid="feed-tag-input"
                />

                {field.value.length > 0 && (
                  <Container className="flex-row flex-wrap gap-2">
                    {field.value.map((tag, index) => (
                      <PostTag
                        key={`${tag}-${index}`}
                        label={tag}
                        showClose={!loading}
                        onClose={() => field.onChange(field.value.filter((_, i) => i !== index))}
                      />
                    ))}
                  </Container>
                )}
              </>
            )}
          />
        </Container>

        {(isTaggedAsReach || domainTags.length > 0) && (
          <Container className="gap-y-2" data-testid="profile-tags-section">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Profile Tags'}</Label>

            <Typography overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
              {'Filter by how people are tagged.'}
            </Typography>

            {isTaggedAsReach && (
              <TagInput
                onTagAdd={handleDomainTagAdd}
                placeholder={'profile tag'}
                existingTags={domainTags.map((label) => ({ label }))}
                viewerTags={domainTags.map((label) => ({ label }))}
                disabled={loading}
                maxTags={HOME_PROFILE_TAGS_MAX_SELECTED}
                currentTagsCount={domainTags.length}
                limitReachedPlaceholder={`${HOME_PROFILE_TAGS_MAX_SELECTED} tags max`}
                showEmojiButton={!isAtProfileTagLimit}
                enableApiSuggestions
                excludeFromApiSuggestions={domainTags}
                addOnSuggestionClick
                className="w-48"
                data-testid="feed-profile-tag-input"
              />
            )}

            {domainTags.length > 0 && (
              <Container className="flex-row flex-wrap gap-2">
                {domainTags.map((tag, index) => (
                  <PostTag
                    key={`${tag}-${index}`}
                    label={tag}
                    showClose={isTaggedAsReach && !loading}
                    onClose={() =>
                      form.setValue(
                        CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS,
                        domainTags.filter((_, i) => i !== index),
                        { shouldValidate: true, shouldDirty: true },
                      )
                    }
                  />
                ))}
              </Container>
            )}
          </Container>
        )}

        <DialogFooter>
          {mode === 'edit' && (
            <Button
              variant="destructive"
              size="lg"
              onClick={handleDeleteFeed}
              disabled={loading}
              className="h-15 w-full"
              data-testid="delete-feed-button"
            >
              <Trash2 className="size-4" />
              {'Delete Feed'}
            </Button>
          )}

          <Button
            variant="secondary"
            size="lg"
            onClick={handleSaveFeed}
            disabled={loading || !form.formState.isValid}
            className="h-15 w-full"
            data-testid="save-feed-button"
          >
            <Check className="size-4" />
            {'Save Feed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
