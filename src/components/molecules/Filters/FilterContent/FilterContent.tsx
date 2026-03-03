'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@/libs';
import * as Core from '@/core';
import * as Molecules from '@/molecules';

export function FilterContent({
  selectedTab,
  defaultSelectedTab = Core.CONTENT.ALL,
  onTabChange,
  disabled,
}: Molecules.BaseFilterProps<Core.ContentType>) {
  const t = useTranslations('filters.content');

  const items = React.useMemo(
    () => [
      { key: Core.CONTENT.ALL, label: t('all'), icon: Libs.Layers, disabled },
      { key: Core.CONTENT.SHORT, label: t('posts'), icon: Libs.StickyNote, disabled },
      { key: Core.CONTENT.LONG, label: t('articles'), icon: Libs.Newspaper, disabled },
      { key: Core.CONTENT.IMAGES, label: t('images'), icon: Libs.Image, disabled },
      { key: Core.CONTENT.VIDEOS, label: t('videos'), icon: Libs.CirclePlay, disabled },
      { key: Core.CONTENT.LINKS, label: t('links'), icon: Libs.Link, disabled },
      { key: Core.CONTENT.FILES, label: t('files'), icon: Libs.Download, disabled },
    ],
    [t, disabled],
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
