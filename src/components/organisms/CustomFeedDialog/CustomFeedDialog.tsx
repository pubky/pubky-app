'use client';

import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import * as Core from '@/core';
import * as Hooks from '@/hooks';
import { useTranslations } from 'next-intl';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { useRouter } from 'next/navigation';
import { APP_ROUTES } from '@/app/routes';
import {
  Radio,
  HeartHandshake,
  SquareAsterisk,
  Flame,
  Columns3,
  Menu,
  LayoutGrid,
  Layers,
  StickyNote,
  Newspaper,
  Image,
  CirclePlay,
  Link,
  Download,
  Activity,
  Delete,
} from 'lucide-react';
import { UsersRound2 } from '@/icons';
import { Env } from '@/libs/env/env';
type CustomFeedDialogProps = {
  mode: 'create' | 'edit';
  children: ReactNode;
};
type CustomFeedDialogContent = PubkyAppPostKind | 'ALL';
function isVisualCustomFeedContentSupported(content?: CustomFeedDialogContent): boolean {
  return content === 'ALL' || content === PubkyAppPostKind.Image || content === PubkyAppPostKind.Video;
}
export const CustomFeedDialog = ({ mode, children }: CustomFeedDialogProps) => {
  const router = useRouter();
  const { toast } = Molecules.useToast();
  const customFeed = Hooks.useCustomFeed();
  const tFilter = useTranslations('filters');
  const tDialog = useTranslations('dialogs.customFeed');
  const tToast = useTranslations('toast');
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
  const [content, setContent] = useState<CustomFeedDialogContent | undefined>(mode === 'create' ? 'ALL' : undefined);
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
    {
      value: PubkyAppFeedReach.All,
      label: tFilter('reach.all'),
      icon: Radio,
    },
    {
      value: PubkyAppFeedReach.Following,
      label: tFilter('reach.following'),
      icon: UsersRound2,
    },
    {
      value: PubkyAppFeedReach.Friends,
      label: tFilter('reach.friends'),
      icon: HeartHandshake,
    },
  ];
  const sortFilters = [
    {
      value: PubkyAppFeedSort.Recent,
      label: tFilter('sort.recent'),
      icon: SquareAsterisk,
    },
    {
      value: PubkyAppFeedSort.Popularity,
      label: tFilter('sort.popularity'),
      icon: Flame,
    },
  ];
  const layoutFilters = [
    {
      value: PubkyAppFeedLayout.Columns,
      label: tFilter('layout.columns'),
      icon: Columns3,
    },
    {
      value: PubkyAppFeedLayout.Wide,
      label: tFilter('layout.wide'),
      icon: Menu,
    },
    {
      value: PubkyAppFeedLayout.Visual,
      label: tFilter('layout.visual'),
      icon: LayoutGrid,
    },
  ];
  const allContentFilters: Array<{
    value: CustomFeedDialogContent;
    label: string;
    icon: ComponentType;
  }> = [
    {
      value: 'ALL',
      label: tFilter('content.all'),
      icon: Layers,
    },
    {
      value: PubkyAppPostKind.Short,
      label: tFilter('content.posts'),
      icon: StickyNote,
    },
    {
      value: PubkyAppPostKind.Long,
      label: tFilter('content.articles'),
      icon: Newspaper,
    },
    {
      value: PubkyAppPostKind.Image,
      label: tFilter('content.images'),
      icon: Image,
    },
    {
      value: PubkyAppPostKind.Video,
      label: tFilter('content.videos'),
      icon: CirclePlay,
    },
    {
      value: PubkyAppPostKind.Link,
      label: tFilter('content.links'),
      icon: Link,
    },
    {
      value: PubkyAppPostKind.File,
      label: tFilter('content.files'),
      icon: Download,
    },
  ];
  const contentFilters =
    layout === PubkyAppFeedLayout.Visual
      ? allContentFilters.filter((filter) => isVisualCustomFeedContentSupported(filter.value))
      : allContentFilters;
  useEffect(() => {
    if (layout !== PubkyAppFeedLayout.Visual) return;
    if (content === undefined || isVisualCustomFeedContentSupported(content)) return;
    setContent('ALL');
  }, [content, layout]);
  const handleLayoutChange = (value: string) => {
    const nextLayout = Number(value) as PubkyAppFeedLayout;
    setLayout(nextLayout);
    if (
      nextLayout === PubkyAppFeedLayout.Visual &&
      content !== undefined &&
      !isVisualCustomFeedContentSupported(content)
    ) {
      setContent('ALL');
    }
  };
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
          title: tToast('success'),
          description: tDialog('feedCreated', {
            name: feed.name,
          }),
        });
        router.push(`${APP_ROUTES.FEED}/${feed.id}`);
      } catch {
        toast({
          title: tToast('error'),
          description: tDialog('feedCreateError'),
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
          changes: {
            name,
            reach,
            sort,
            layout,
            content: content === 'ALL' ? null : content,
            tags,
          },
        });
        setOpen(false);
        toast({
          title: tToast('success'),
          description: tDialog('feedEdited', {
            name: feed.name,
          }),
        });
        router.push(`${APP_ROUTES.FEED}/${feed.id}`);
      } catch {
        toast({
          title: tToast('error'),
          description: tDialog('feedEditError'),
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
      await Core.FeedController.commitDelete({
        feedId: customFeed.id,
      });
      setOpen(false);
      toast({
        title: tToast('success'),
        description: tDialog('feedDeleted', {
          name: customFeed.name,
        }),
      });
      router.push(APP_ROUTES.HOME);
    } catch {
      toast({
        title: tToast('error'),
        description: tDialog('feedDeleteError'),
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
          <Atoms.DialogTitle>{mode === 'create' ? tDialog('createTitle') : tDialog('editTitle')}</Atoms.DialogTitle>
        </Atoms.DialogHeader>

        <Atoms.Container className="gap-y-2">
          <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">
            {tDialog('feedName')}
          </Atoms.Label>

          <Atoms.Input
            required
            placeholder={tDialog('feedNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={disabled}
            className="h-14 border-dashed"
            data-testid="feed-name-input"
          />
        </Atoms.Container>

        <Atoms.Container className="flex-wrap gap-x-8 gap-y-4 sm:flex-row">
          <Atoms.Container overrideDefaults className="flex flex-col gap-y-2" data-testid="reach-filter-section">
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">
              {tDialog('reach')}
            </Atoms.Label>

            <Atoms.Select
              value={reach === undefined ? reach : String(reach)}
              onValueChange={(v) => setReach(Number(v))}
              disabled={disabled}
              data-testid="reach-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder={tDialog('reachPlaceholder')} />
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
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">
              {tDialog('sort')}
            </Atoms.Label>

            <Atoms.Select
              value={sort === undefined ? sort : String(sort)}
              onValueChange={(v) => setSort(Number(v))}
              disabled={disabled}
              data-testid="sort-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder={tDialog('sortPlaceholder')} />
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
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">
              {tDialog('layout')}
            </Atoms.Label>

            <Atoms.Select
              value={layout === undefined ? layout : String(layout)}
              onValueChange={handleLayoutChange}
              disabled={disabled}
              data-testid="layout-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder={tDialog('layoutPlaceholder')} />
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
            <Atoms.Label className="text-xs tracking-wide text-muted-foreground uppercase">
              {tDialog('content')}
            </Atoms.Label>

            <Atoms.Select
              value={content === undefined ? content : String(content)}
              onValueChange={(v) => setContent(v === 'ALL' ? v : Number(v))}
              disabled={disabled}
              data-testid="content-select"
            >
              <Atoms.SelectTrigger className="w-full sm:w-fit">
                <Atoms.SelectValue placeholder={tDialog('contentPlaceholder')} />
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
            {tDialog('filterTags')}
          </Atoms.Label>

          <Molecules.TagInput
            onTagAdd={(tag) => setTags([...tags, tag])}
            existingTags={tags.map((tag) => ({
              label: tag,
            }))}
            showCloseButton={false}
            disabled={disabled}
            maxTags={Env.NEXT_MAX_STREAM_TAGS}
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
            <Activity className="size-4" />
            {tDialog('saveFeed')}
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
              <Delete className="size-4" />
              {tDialog('deleteFeed')}
            </Atoms.Button>
          )}
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
};
