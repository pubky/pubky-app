'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps } from '../Filters.types';

import { Layers, StickyNote, Newspaper, Image, CirclePlay, Link, Download } from 'lucide-react';
import { CONTENT, type ContentType } from '@/stores/home/home.types';
interface FilterContentProps extends BaseFilterProps<ContentType> {
  disabledTabs?: ContentType[];
}
export function FilterContent({
  selectedTab,
  defaultSelectedTab = CONTENT.ALL,
  onTabChange,
  disabled,
  disabledTabs = [],
}: FilterContentProps) {
  const t = useTranslations('filters.content');
  const disabledSet = React.useMemo(() => new Set(disabledTabs), [disabledTabs]);
  const isDisabled = React.useCallback(
    (contentType: ContentType) => {
      return disabled || disabledSet.has(contentType) ? true : undefined;
    },
    [disabled, disabledSet],
  );
  const items = React.useMemo(
    () => [
      {
        key: CONTENT.ALL,
        label: t('all'),
        icon: Layers,
        disabled: isDisabled(CONTENT.ALL),
      },
      {
        key: CONTENT.SHORT,
        label: t('posts'),
        icon: StickyNote,
        disabled: isDisabled(CONTENT.SHORT),
      },
      {
        key: CONTENT.LONG,
        label: t('articles'),
        icon: Newspaper,
        disabled: isDisabled(CONTENT.LONG),
      },
      {
        key: CONTENT.IMAGES,
        label: t('images'),
        icon: Image,
        disabled: isDisabled(CONTENT.IMAGES),
      },
      {
        key: CONTENT.VIDEOS,
        label: t('videos'),
        icon: CirclePlay,
        disabled: isDisabled(CONTENT.VIDEOS),
      },
      {
        key: CONTENT.LINKS,
        label: t('links'),
        icon: Link,
        disabled: isDisabled(CONTENT.LINKS),
      },
      {
        key: CONTENT.FILES,
        label: t('files'),
        icon: Download,
        disabled: isDisabled(CONTENT.FILES),
      },
    ],
    [t, isDisabled],
  );
  return (
    <FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
    />
  );
}
