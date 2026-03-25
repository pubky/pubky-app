'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Molecules from '@/molecules';

interface FilterContentProps extends Molecules.BaseFilterProps<Core.ContentType> {
  disabledTabs?: Core.ContentType[];
}

export function FilterContent({
  selectedTab,
  defaultSelectedTab = Core.CONTENT.ALL,
  onTabChange,
  disabled,
  disabledTabs = [],
}: FilterContentProps) {
  const t = useTranslations('filters.content');

  const disabledSet = React.useMemo(() => new Set(disabledTabs), [disabledTabs]);
  const isDisabled = React.useCallback(
    (contentType: Core.ContentType) => {
      return disabled || disabledSet.has(contentType) ? true : undefined;
    },
    [disabled, disabledSet],
  );
  const items = React.useMemo(
    () => [
      { key: Core.CONTENT.ALL, label: t('all'), icon: Libs.Layers, disabled: isDisabled(Core.CONTENT.ALL) },
      {
        key: Core.CONTENT.SHORT,
        label: t('posts'),
        icon: Libs.StickyNote,
        disabled: isDisabled(Core.CONTENT.SHORT),
      },
      {
        key: Core.CONTENT.LONG,
        label: t('articles'),
        icon: Libs.Newspaper,
        disabled: isDisabled(Core.CONTENT.LONG),
      },
      {
        key: Core.CONTENT.IMAGES,
        label: t('images'),
        icon: Libs.Image,
        disabled: isDisabled(Core.CONTENT.IMAGES),
      },
      {
        key: Core.CONTENT.VIDEOS,
        label: t('videos'),
        icon: Libs.CirclePlay,
        disabled: isDisabled(Core.CONTENT.VIDEOS),
      },
      {
        key: Core.CONTENT.LINKS,
        label: t('links'),
        icon: Libs.Link,
        disabled: isDisabled(Core.CONTENT.LINKS),
      },
      {
        key: Core.CONTENT.FILES,
        label: t('files'),
        icon: Libs.Download,
        disabled: isDisabled(Core.CONTENT.FILES),
      },
    ],
    [t, isDisabled],
  );

  return (
    <Molecules.FilterRadioGroup
      title={t('title')}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
    />
  );
}
