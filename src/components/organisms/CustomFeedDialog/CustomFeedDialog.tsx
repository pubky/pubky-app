'use client';

import { type ComponentType, type ReactNode, useEffect, useState } from 'react';
import {
  Check,
  CircleHelp,
  CirclePlay,
  Columns3,
  Download,
  Flame,
  Globe,
  Grid2X2,
  Image,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  Link,
  Newspaper,
  Rows2,
  Rows4,
  Shapes,
  SquareAsterisk,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { type KnownFeedLayout, type KnownFeedReach, type KnownFeedSort, type KnownPostKind } from 'pubky-social-specs';
import { Controller, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { DynamicLucideIcon } from '@/atoms/DynamicLucideIcon/DynamicLucideIcon';
import { FilterList } from '@/atoms/Filter/Filter';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@/atoms/Tooltip/Tooltip';
import { Typography } from '@/atoms/Typography/Typography';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { ResourceController } from '@/controllers/resource/resource';
import { useControlledState } from '@/hooks/useControlledState/useControlledState';
import { useCustomFeedForm } from '@/hooks/useCustomFeedForm/useCustomFeedForm';
import {
  CUSTOM_FEED_CONTENT_ALL,
  CUSTOM_FEED_CONTENT_RESOURCES,
  CUSTOM_FEED_FORM_FIELDS,
  CUSTOM_FEED_RESOURCE_TYPES_ALL,
  type CustomFeedFormContent,
  type CustomFeedFormReach,
  getCustomFeedResourceReaches,
} from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import {
  keepFeedResourceFilters,
  removeFeedResourceFilter,
} from '@/hooks/useCustomResourceFeed/useCustomResourceFeed.utils';
import { useResourceSearch } from '@/hooks/useResourceSearch/useResourceSearch';
import { getMaxStreamTags } from '@/libs/runtime-config/runtime-config';
import { canonicalizeTagLabel } from '@/libs/utils/utils';
import type { FeedModelSchema } from '@/models/feed/feed.schema';
import { REACH_FILTER_META } from '@/molecules/Filters/FilterReach/FilterReach';
import { PostTag } from '@/molecules/PostTag/PostTag';
import { TagInput } from '@/molecules/TagInput/TagInput';
import { IconPickerDialog } from '@/organisms/IconPickerDialog/IconPickerDialog';
import { KIND_ICONS } from '@/organisms/SearchResources/SearchResourceFilters';
import { RemovableRow } from '@/organisms/SearchResources/SearchResourceKindFilters';
import {
  getResourceFeedTypeOptions,
  getResourceServicesQuery,
  getResourceTypesLabel,
  withKnownHostNames,
} from '@/pipes/resource/resource.search';
import { type ReachFilterValue } from '@/stores/home/home.types';
import { HOME_PROFILE_TAGS_MAX_SELECTED } from '@/stores/home/home.types';
import { pubkyReachToHomeReach } from '@/utils/pubky-app-spec-feed-mappers';
import { getFeedResourceFilterRows } from './CustomFeedDialog.utils';

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
  return content === CUSTOM_FEED_CONTENT_ALL || content === 'image' || content === 'video';
}

function parseReachValue(value: string): CustomFeedFormReach {
  return value === TAGGED_AS_FILTER_KEY ? TAGGED_AS_FILTER_KEY : (value as KnownFeedReach);
}

/** Shown for a stored reach/content this dialog cannot offer as a choice. */
const UNSUPPORTED_OPTION_LABEL = 'Unsupported (set elsewhere)';

const LAYOUT_HINT = 'Cards also applies on mobile. Other layouts use a single column on mobile.';

const REACH_OPTION_VALUES: CustomFeedFormReach[] = ['wot', TAGGED_AS_FILTER_KEY, 'following', 'friends', 'me', 'all'];

/** Every kind and sub-kind a feed of external resources can list. */
const RESOURCE_TYPE_OPTIONS = getResourceFeedTypeOptions();

export const CustomFeedDialog = (props: CustomFeedDialogProps) => {
  const { mode, children } = props;
  const { value: open, setValue: setOpen } = useControlledState<boolean>({
    value: props.open,
    defaultValue: false,
    onChange: props.onOpenChange,
  });
  const [isLayoutTooltipOpen, setIsLayoutTooltipOpen] = useState(false);
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
  const resourceFilters = useWatch({ control, name: CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS }) ?? null;

  const isTaggedAsReach = reach === TAGGED_AS_FILTER_KEY;
  const isResources = content === CUSTOM_FEED_CONTENT_RESOURCES;
  // The saved services' names, as the Service filter shows them: Pinakes names each host's service
  const savedHosts = resourceFilters?.host ? resourceFilters.host.split(',') : [];
  const servicesQuery = open && isResources && savedHosts.length > 0 ? getResourceServicesQuery(savedHosts) : null;
  const { hostFacets: readFacets, loading: isNamingHosts } = useResourceSearch(servicesQuery, {
    limit: 1,
    facets: true,
  });
  // While they are read, the names an earlier read of them left in the cache: the Edit dialog opens anew each time
  const hostFacets =
    readFacets ??
    (isNamingHosts && servicesQuery ? (ResourceController.getCachedHostFacets(servicesQuery, 1) ?? null) : null);
  // The names read so far: a service named once stays named while the names are read again, and after a
  // read that does not list it
  const [knownHosts, setKnownHosts] = useState({ facets: hostFacets, names: hostFacets ?? [] });
  if (hostFacets && hostFacets !== knownHosts.facets) {
    setKnownHosts({ facets: hostFacets, names: withKnownHostNames(hostFacets, knownHosts.names, savedHosts) });
  }
  const namingFacets = hostFacets
    ? withKnownHostNames(hostFacets, knownHosts.names, savedHosts)
    : isNamingHosts
      ? knownHosts.names
      : null;
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
      value: 'recent',
      label: 'Recent',
      icon: SquareAsterisk,
    },
    {
      value: 'popularity',
      label: 'Popularity',
      icon: Flame,
    },
  ];
  const layoutFilters = [
    {
      value: 'columns',
      label: 'Columns',
      icon: Columns3,
    },
    {
      value: 'wide',
      label: 'Wide',
      icon: Rows2,
    },
    {
      value: 'visual',
      label: 'Visual',
      icon: Grid2X2,
    },
    {
      value: 'list',
      label: 'List',
      icon: Rows4,
    },
    {
      value: 'cards',
      label: 'Cards',
      icon: LayoutDashboard,
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
      value: 'note',
      label: 'Posts',
      icon: StickyNote,
    },
    {
      value: 'article',
      label: 'Articles',
      icon: Newspaper,
    },
    {
      value: 'collection',
      label: 'Collections',
      icon: Library,
    },
    {
      value: 'image',
      label: 'Images',
      icon: Image,
    },
    {
      value: 'video',
      label: 'Videos',
      icon: CirclePlay,
    },
    {
      value: 'link',
      label: 'Links',
      icon: Link,
    },
    {
      value: 'file',
      label: 'Files',
      icon: Download,
    },
    {
      value: CUSTOM_FEED_CONTENT_RESOURCES,
      label: 'External resources',
      icon: Globe,
    },
  ];
  const contentFilters =
    layout === 'visual'
      ? allContentFilters.filter(
          // A stored Visual feed of external resources keeps showing what it is
          (filter) => isVisualCustomFeedContentSupported(filter.value) || (isResources && filter.value === content),
        )
      : allContentFilters;

  // A feed authored elsewhere can hold a reach this dialog has no option for
  // (`followers`). Show the value as a disabled entry so the Select reflects
  // what is stored rather than falling back to its placeholder and reading as
  // "nothing selected".
  const unsupportedReach = reachFilters.some((filter) => filter.value === reach) ? null : reach;
  const unsupportedContent = contentFilters.some((filter) => filter.value === content) ? null : content;

  // Catches a stored feed whose layout/content pair another client left in a
  // combination this dialog cannot represent; user-driven layout changes are
  // corrected up-front in `handleLayoutChange`.
  useEffect(() => {
    if (layout !== 'visual') return;
    if (isVisualCustomFeedContentSupported(content)) return;
    // A feed of external resources stays one, and keeps a Visual layout another client stored: the
    // layout is part of its id, and its cards show in one column there.
    if (content === CUSTOM_FEED_CONTENT_RESOURCES) return;
    form.setValue(CUSTOM_FEED_FORM_FIELDS.CONTENT, CUSTOM_FEED_CONTENT_ALL, { shouldValidate: true });
  }, [content, layout, form]);

  const handleLayoutChange = (value: string, onChange: (next: KnownFeedLayout) => void) => {
    const nextLayout = value as KnownFeedLayout;
    onChange(nextLayout);
    if (nextLayout === 'visual' && !isVisualCustomFeedContentSupported(content)) {
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

  // External resources are searched in the network reaches, with no profile tags: choosing them
  // moves a Me or Tagged-as reach (and My network where Pinakes serves none) to All, and the dialog
  // does not list those.
  const handleContentChange = (value: string, onChange: (next: CustomFeedFormContent) => void) => {
    onChange(
      value === CUSTOM_FEED_CONTENT_ALL || value === CUSTOM_FEED_CONTENT_RESOURCES ? value : (value as KnownPostKind),
    );
    if (value !== CUSTOM_FEED_CONTENT_RESOURCES) return;
    if (!getCustomFeedResourceReaches().includes(reach)) {
      form.setValue(CUSTOM_FEED_FORM_FIELDS.REACH, 'all', { shouldValidate: true, shouldDirty: true });
    }
    form.setValue(CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS, [], { shouldValidate: true });
  };

  // A feed of external resources is searched in All, Following, Friends or My network (where Pinakes
  // serves it), with no profile tags: a reach it has no counterpart for (one another client stored)
  // reads as All, as in the feed's own filters, and stored profile tags are dropped, as choosing
  // External resources does
  const hasDomainTags = domainTags.length > 0;
  useEffect(() => {
    if (!isResources) return;
    if (!getCustomFeedResourceReaches().includes(reach)) {
      form.setValue(CUSTOM_FEED_FORM_FIELDS.REACH, 'all', { shouldValidate: true, shouldDirty: true });
    }
    if (hasDomainTags) {
      form.setValue(CUSTOM_FEED_FORM_FIELDS.DOMAIN_TAGS, [], { shouldValidate: true, shouldDirty: true });
    }
  }, [isResources, reach, hasDomainTags, form]);

  const handleDomainTagAdd = (tag: string) => {
    // The fold the feed stores (ASCII letters only), so the label shown is the one the filter will hold.
    const normalizedTag = canonicalizeTagLabel(tag);
    if (
      !isTaggedAsReach ||
      !normalizedTag ||
      domainTags.length >= HOME_PROFILE_TAGS_MAX_SELECTED ||
      domainTags.some((existingTag) => canonicalizeTagLabel(existingTag) === normalizedTag)
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
        data-cy="custom-feed-dialog"
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
                className="h-14 border-dashed bg-background/20"
                data-testid="feed-name-input"
                data-cy="custom-feed-name-input"
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
                  <SelectTrigger className="w-full sm:w-fit" data-cy="custom-feed-reach-select">
                    <SelectValue placeholder={'Select a reach'} />
                  </SelectTrigger>

                  <SelectContent data-cy="custom-feed-select-options">
                    {unsupportedReach !== null && (
                      <SelectItem disabled value={String(unsupportedReach)}>
                        {UNSUPPORTED_OPTION_LABEL}
                      </SelectItem>
                    )}
                    {reachFilters
                      // A feed of external resources lists the reaches Pinakes searches in (All,
                      // Following, Friends, and My network where it serves it)
                      .filter((r) => !isResources || getCustomFeedResourceReaches().includes(r.value))
                      .map((r) => (
                        <SelectItem key={r.value} value={String(r.value)} data-cy="custom-feed-select-option">
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
                  onValueChange={(v) => field.onChange(v as KnownFeedSort)}
                  disabled={loading}
                  data-testid="sort-select"
                >
                  <SelectTrigger className="w-full sm:w-fit" data-cy="custom-feed-sort-select">
                    <SelectValue placeholder={'Select a sort'} />
                  </SelectTrigger>

                  <SelectContent data-cy="custom-feed-select-options">
                    {sortFilters.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)} data-cy="custom-feed-select-option">
                        <r.icon /> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Container>

          <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="layout-filter-section">
            <Container overrideDefaults className="flex items-center gap-1">
              <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Layout'}</Label>

              {/*
                Radix opens a tooltip on hover and on focus. On touch the focus lands
                after its pointer-down guard has cleared, so a tap toggles the hint
                itself instead of leaving a touch user with no way to read it.
              */}
              <Tooltip open={isLayoutTooltipOpen} onOpenChange={setIsLayoutTooltipOpen}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={'About layout settings'}
                    className="shrink-0 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid="layout-tooltip-trigger"
                    onPointerDown={(event) => {
                      event.stopPropagation();

                      if (event.pointerType !== 'touch') return;

                      event.preventDefault();
                      setIsLayoutTooltipOpen((tooltipOpen) => !tooltipOpen);
                    }}
                    // A touch tap can emit a click after pointer-up. Keep Radix from
                    // closing the hint that the pointer-down handler just opened.
                    onClick={(event) => event.preventDefault()}
                  >
                    <CircleHelp className="size-3.5" />
                  </button>
                </TooltipTrigger>

                <TooltipPortal>
                  <TooltipContent>{LAYOUT_HINT}</TooltipContent>
                </TooltipPortal>
              </Tooltip>
            </Container>

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
                  <SelectTrigger className="w-full sm:w-fit" data-cy="custom-feed-layout-select">
                    <SelectValue placeholder={'Select a layout'} />
                  </SelectTrigger>

                  <SelectContent data-cy="custom-feed-select-options">
                    {layoutFilters
                      // Resource cards have no Visual tiles: not listed, unless the feed already holds it
                      .filter((r) => !isResources || r.value !== 'visual' || r.value === field.value)
                      .map((r) => (
                        <SelectItem key={r.value} value={String(r.value)} data-cy="custom-feed-select-option">
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
                  onValueChange={(v) => handleContentChange(v, field.onChange)}
                  disabled={loading}
                  data-testid="content-select"
                >
                  <SelectTrigger className="w-full sm:w-fit" data-cy="custom-feed-content-select">
                    <SelectValue placeholder={'Select content'} />
                  </SelectTrigger>

                  <SelectContent data-cy="custom-feed-select-options">
                    {unsupportedContent !== null && (
                      <SelectItem disabled value={String(unsupportedContent)}>
                        {UNSUPPORTED_OPTION_LABEL}
                      </SelectItem>
                    )}
                    {contentFilters.map((r) => (
                      <SelectItem key={r.value} value={String(r.value)} data-cy="custom-feed-select-option">
                        <r.icon /> {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Container>

          {isResources && (
            <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="resource-type-section">
              <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Type'}</Label>

              <Controller
                name={CUSTOM_FEED_FORM_FIELDS.RESOURCE_TYPES}
                control={control}
                render={({ field }) => {
                  const value = String(field.value);
                  // Types another client saved that no option here stands for stay as they are
                  const isOther =
                    value !== CUSTOM_FEED_RESOURCE_TYPES_ALL &&
                    !RESOURCE_TYPE_OPTIONS.some((option) => option.value === value);
                  // Filters of a kind's own (When, Where, a Service…) go with a Type of another kind
                  const handleTypeChange = (next: string) => {
                    const toTypes = (option: string) =>
                      option === CUSTOM_FEED_RESOURCE_TYPES_ALL ? null : option.split(',');
                    form.setValue(
                      CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS,
                      keepFeedResourceFilters(resourceFilters, toTypes(value), toTypes(next)),
                      { shouldValidate: true, shouldDirty: true },
                    );
                    field.onChange(next);
                  };
                  return (
                    <Select
                      value={value}
                      onValueChange={handleTypeChange}
                      disabled={loading}
                      data-testid="resource-type-select"
                    >
                      <SelectTrigger className="w-full sm:w-fit" data-cy="custom-feed-resource-type-select">
                        <SelectValue placeholder={'Select a type'} />
                      </SelectTrigger>

                      <SelectContent data-cy="custom-feed-select-options">
                        <SelectItem value={CUSTOM_FEED_RESOURCE_TYPES_ALL} data-cy="custom-feed-select-option">
                          <LayoutGrid /> {'All types'}
                        </SelectItem>
                        {isOther && (
                          <SelectItem value={value} data-cy="custom-feed-select-option">
                            <Shapes /> {getResourceTypesLabel(value.split(','))}
                          </SelectItem>
                        )}
                        {RESOURCE_TYPE_OPTIONS.map((option) => {
                          // Its kind's icon, as the Kind filter shows it
                          const Icon = KIND_ICONS[option.kindId] ?? Shapes;
                          return (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              className={option.isSubKind ? 'pl-6' : undefined}
                              data-cy="custom-feed-select-option"
                            >
                              <Icon /> {option.label}
                              {option.isSubKind && <span className="sr-only">{`, in ${option.kind}`}</span>}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  );
                }}
              />
            </Container>
          )}

          {isResources && resourceFilters && (
            // The saved search filters, one row each as the feed's filter panel has them: pressing one removes it
            <Container overrideDefaults className="flex flex-col gap-y-2" data-testid="resource-filters-section">
              <Label className="text-xs tracking-wide text-muted-foreground uppercase">{'Filters'}</Label>
              <FilterList data-testid="resource-filter-rows">
                {getFeedResourceFilterRows(resourceFilters, namingFacets, isNamingHosts).map((row) => (
                  <RemovableRow
                    key={row.name}
                    icon={row.icon}
                    label={row.label}
                    isLoading={row.isLoading}
                    onRemove={() =>
                      form.setValue(
                        CUSTOM_FEED_FORM_FIELDS.RESOURCE_FILTERS,
                        removeFeedResourceFilter(resourceFilters, row.name),
                        { shouldValidate: true, shouldDirty: true },
                      )
                    }
                    testId={`resource-filter-row-${row.name}`}
                  />
                ))}
              </FilterList>
            </Container>
          )}
        </Container>

        <Container className="gap-y-2">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">
            {isResources ? 'Tags' : 'Post Tags'}
          </Label>

          <Typography overrideDefaults className="text-base leading-6 font-medium text-secondary-foreground">
            {isResources ? 'Filter by what external resources are tagged with.' : 'Filter by what posts are about.'}
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

        {!isResources && (isTaggedAsReach || domainTags.length > 0) && (
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
              data-cy="custom-feed-delete-btn"
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
            data-cy="custom-feed-save-btn"
          >
            <Check className="size-4" />
            {'Save Feed'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
