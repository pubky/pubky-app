'use client';

import { useEffect, useState, type ReactNode } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import { useTranslations } from 'next-intl';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';

type CustomFeedDialogProps = {
  mode: 'create' | 'edit';
  children: ReactNode;
};

export const CustomFeedDialog = ({ mode, children }: CustomFeedDialogProps) => {
  const router = useRouter();
  const { toast } = Molecules.useToast();
  const customFeed = Hooks.useCustomFeed();
  const t = useTranslations('filters');

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reach, setReach] = useState<PubkyAppFeedReach | undefined>(
    mode === 'create' ? PubkyAppFeedReach.All : undefined,
  );
  const [sort, setSort] = useState<PubkyAppFeedSort | undefined>(
    mode === 'create' ? PubkyAppFeedSort.Recent : undefined,
  );
  const [layout, setLayout] = useState<PubkyAppFeedLayout | undefined>(
    mode === 'create' ? PubkyAppFeedLayout.Columns : undefined,
  );
  const [content, setContent] = useState<PubkyAppPostKind | 'ALL' | undefined>(mode === 'create' ? 'ALL' : undefined);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const disabled = loading || (mode === 'edit' && !customFeed);

  useEffect(() => {
    if (open) return;

    if (mode === 'create') {
      setName('');
      setReach(PubkyAppFeedReach.All);
      setSort(PubkyAppFeedSort.Recent);
      setLayout(PubkyAppFeedLayout.Columns);
      setContent('ALL');
      setTags([]);
    } else if (mode === 'edit') {
      setName(customFeed?.name ?? '');
      setReach(customFeed?.reach);
      setSort(customFeed?.sort);
      setLayout(customFeed?.layout);
      setContent(customFeed?.content === null ? 'ALL' : customFeed?.content);
      setTags(customFeed?.tags ?? []);
    }
  }, [open, mode, customFeed]);

  const reachFilters = [
    { value: PubkyAppFeedReach.All, label: t('reach.all'), icon: Libs.Radio },
    { value: PubkyAppFeedReach.Following, label: t('reach.following'), icon: Libs.UsersRound2 },
    { value: PubkyAppFeedReach.Friends, label: t('reach.friends'), icon: Libs.HeartHandshake },
  ];

  const sortFilters = [
    { value: PubkyAppFeedSort.Recent, label: t('sort.recent'), icon: Libs.SquareAsterisk },
    { value: PubkyAppFeedSort.Popularity, label: t('sort.popularity'), icon: Libs.Flame },
  ];

  const layoutFilters = [
    { value: PubkyAppFeedLayout.Columns, label: t('layout.columns'), icon: Libs.Columns3 },
    { value: PubkyAppFeedLayout.Wide, label: t('layout.wide'), icon: Libs.Menu },
  ];

  const contentFilters = [
    { value: 'ALL', label: t('content.all'), icon: Libs.Layers },
    { value: PubkyAppPostKind.Short, label: t('content.posts'), icon: Libs.StickyNote },
    { value: PubkyAppPostKind.Long, label: t('content.articles'), icon: Libs.Newspaper },
    { value: PubkyAppPostKind.Image, label: t('content.images'), icon: Libs.Image },
    { value: PubkyAppPostKind.Video, label: t('content.videos'), icon: Libs.CirclePlay },
    { value: PubkyAppPostKind.Link, label: t('content.links'), icon: Libs.Link },
    { value: PubkyAppPostKind.File, label: t('content.files'), icon: Libs.Download },
  ];

  const handleSaveFeed = async () => {
    if (reach === undefined || sort === undefined || layout === undefined || content === undefined) return;

    if (mode === 'create') {
      try {
        setLoading(true);
        const feed = await Core.FeedController.commitCreate({
          name,
          reach,
          sort,
          layout,
          content: content === 'ALL' ? null : content,
          tags,
        });

        setOpen(false);
        toast({
          title: 'Success',
          description: `Feed ${feed.name} created!`,
        });
        router.push(`${APP_ROUTES.FEED}/${feed.id}`);
      } catch {
        toast({
          title: 'Error',
          description: 'Could not create feed, please try again or reach out to support.',
        });
      } finally {
        setLoading(false);
      }
    } else if (mode === 'edit') {
      if (!customFeed) return;

      try {
        setLoading(true);
        const feed = await Core.FeedController.commitUpdate({
          feedId: customFeed.id,
          changes: { name, reach, sort, layout, content: content === 'ALL' ? null : content, tags },
        });

        setOpen(false);
        toast({
          title: 'Success',
          description: `Feed ${feed.name} edited!`,
        });
        router.push(`${APP_ROUTES.FEED}/${feed.id}`);
      } catch {
        toast({
          title: 'Error',
          description: 'Could not edit feed, please try again or reach out to support.',
        });
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteFeed = async () => {
    if (!customFeed) return;

    try {
      setLoading(true);
      await Core.FeedController.commitDelete({ feedId: customFeed.id });

      setOpen(false);
      toast({
        title: 'Success',
        description: `Feed ${customFeed.name} deleted!`,
      });
      router.push(APP_ROUTES.HOME);
    } catch {
      toast({
        title: 'Error',
        description: 'Could not delete feed, please try again or reach out to support.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Atoms.Dialog open={open} onOpenChange={setOpen}>
      <Atoms.DialogTrigger asChild disabled={mode === 'edit' && !customFeed} data-testid="custom-feed-dialog-trigger">
        {children}
      </Atoms.DialogTrigger>

      <Atoms.DialogContent
        onOpenAutoFocus={(e) => {
          if (mode === 'edit') e.preventDefault();
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-3xl"
        data-testid="custom-feed-dialog-content"
      >
        <Atoms.DialogHeader>
          <Atoms.DialogTitle>
            <Atoms.Typography overrideDefaults as="span" className="capitalize">
              {mode}
            </Atoms.Typography>{' '}
            Feed
          </Atoms.DialogTitle>
        </Atoms.DialogHeader>

        <Atoms.Container className="gap-y-2">
          <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">FEED NAME</Atoms.Label>

          <Atoms.Input
            required
            placeholder="Not your keys..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="h-14 border-dashed"
            data-testid="feed-name-input"
          />
        </Atoms.Container>

        <Atoms.Container className="flex-wrap gap-x-8 gap-y-4 sm:flex-row">
          <Atoms.Container overrideDefaults className="flex flex-col gap-y-2" data-testid="reach-filter-section">
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">REACH</Atoms.Label>

            <Atoms.Select
              value={reach === undefined ? reach : String(reach)}
              onValueChange={(v) => setReach(Number(v))}
              disabled={disabled}
              data-testid="reach-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder="Select a reach" />
              </Atoms.SelectTrigger>

              <Atoms.SelectContent>
                {reachFilters.map((r) => (
                  <Atoms.SelectItem key={r.value} value={String(r.value)}>
                    <r.icon /> {r.label}
                  </Atoms.SelectItem>
                ))}
              </Atoms.SelectContent>
            </Atoms.Select>
          </Atoms.Container>

          <Atoms.Container overrideDefaults className="flex flex-col gap-y-2" data-testid="sort-filter-section">
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">SORT</Atoms.Label>

            <Atoms.Select
              value={sort === undefined ? sort : String(sort)}
              onValueChange={(v) => setSort(Number(v))}
              disabled={disabled}
              data-testid="sort-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder="Select a sort" />
              </Atoms.SelectTrigger>

              <Atoms.SelectContent>
                {sortFilters.map((r) => (
                  <Atoms.SelectItem key={r.value} value={String(r.value)}>
                    <r.icon /> {r.label}
                  </Atoms.SelectItem>
                ))}
              </Atoms.SelectContent>
            </Atoms.Select>
          </Atoms.Container>

          <Atoms.Container overrideDefaults className="flex flex-col gap-y-2" data-testid="layout-filter-section">
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">LAYOUT</Atoms.Label>

            <Atoms.Select
              value={layout === undefined ? layout : String(layout)}
              onValueChange={(v) => setLayout(Number(v))}
              disabled={disabled}
              data-testid="layout-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder="Select a layout" />
              </Atoms.SelectTrigger>

              <Atoms.SelectContent>
                {layoutFilters.map((r) => (
                  <Atoms.SelectItem key={r.value} value={String(r.value)}>
                    <r.icon /> {r.label}
                  </Atoms.SelectItem>
                ))}
              </Atoms.SelectContent>
            </Atoms.Select>
          </Atoms.Container>

          <Atoms.Container overrideDefaults className="flex flex-col gap-y-2" data-testid="content-filter-section">
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">CONTENT</Atoms.Label>

            <Atoms.Select
              value={content === undefined ? content : String(content)}
              onValueChange={(v) => setContent(v === 'ALL' ? v : Number(v))}
              disabled={disabled}
              data-testid="content-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder="Select a content" />
              </Atoms.SelectTrigger>

              <Atoms.SelectContent>
                {contentFilters.map((r) => (
                  <Atoms.SelectItem key={r.value} value={String(r.value)}>
                    <r.icon /> {r.label}
                  </Atoms.SelectItem>
                ))}
              </Atoms.SelectContent>
            </Atoms.Select>
          </Atoms.Container>
        </Atoms.Container>

        <Atoms.Container className="gap-y-2">
          <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">
            FILTER ON CONTENT TAGS
          </Atoms.Label>

          <Molecules.TagInput
            onTagAdd={(tag) => setTags([...tags, tag])}
            existingTags={tags.map((tag) => ({ label: tag }))}
            showCloseButton={false}
            disabled={disabled}
            maxTags={Libs.Env.NEXT_MAX_STREAM_TAGS}
            currentTagsCount={tags.length}
            enableApiSuggestions
            excludeFromApiSuggestions={tags}
            addOnSuggestionClick
            className="w-48"
            data-testid="feed-tag-input"
          />

          {tags.length > 0 && (
            <Atoms.Container className="flex-row flex-wrap gap-2">
              {tags.map((tag, index) => (
                <Molecules.PostTag
                  key={`${tag}-${index}`}
                  label={tag}
                  showClose={!disabled}
                  onClose={() => setTags((prevTags) => prevTags.filter((_, i) => i !== index))}
                />
              ))}
            </Atoms.Container>
          )}
        </Atoms.Container>

        <Atoms.DialogFooter>
          <Atoms.Button
            variant="secondary"
            size="lg"
            onClick={handleSaveFeed}
            disabled={disabled || !name || !tags.length}
            className="h-15 w-full"
            data-testid="save-feed-button"
          >
            <Libs.Activity className="size-4" />
            Save Feed
          </Atoms.Button>

          {mode === 'edit' && (
            <Atoms.Button
              variant="destructive"
              size="lg"
              onClick={handleDeleteFeed}
              disabled={disabled}
              className="h-15 w-full"
              data-testid="delete-feed-button"
            >
              <Libs.Delete className="size-4" />
              Delete Feed
            </Atoms.Button>
          )}
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
};
