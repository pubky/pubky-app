'use client';

import * as React from 'react';
import { CirclePlay, Download, Image, Layers, Library, Link, Newspaper, StickyNote } from 'lucide-react';
import { CONTENT, type ContentType } from '@/stores/home/home.types';
import { FilterRadioGroup } from '../FilterRadioGroup/FilterRadioGroup';
import { BaseFilterProps } from '../Filters.types';

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
        label: 'All',
        icon: Layers,
        disabled: isDisabled(CONTENT.ALL),
        dataCy: 'all-content-toggle',
      },
      {
        key: CONTENT.SHORT,
        label: 'Posts',
        icon: StickyNote,
        disabled: isDisabled(CONTENT.SHORT),
        dataCy: 'posts-content-toggle',
      },
      {
        key: CONTENT.LONG,
        label: 'Articles',
        icon: Newspaper,
        disabled: isDisabled(CONTENT.LONG),
        dataCy: 'articles-content-toggle',
      },
      {
        key: CONTENT.COLLECTIONS,
        label: 'Collections',
        icon: Library,
        disabled: isDisabled(CONTENT.COLLECTIONS),
        dataCy: 'collections-content-toggle',
      },
      {
        key: CONTENT.IMAGES,
        label: 'Images',
        icon: Image,
        disabled: isDisabled(CONTENT.IMAGES),
        dataCy: 'images-content-toggle',
      },
      {
        key: CONTENT.VIDEOS,
        label: 'Videos',
        icon: CirclePlay,
        disabled: isDisabled(CONTENT.VIDEOS),
        dataCy: 'videos-content-toggle',
      },
      {
        key: CONTENT.LINKS,
        label: 'Links',
        icon: Link,
        disabled: isDisabled(CONTENT.LINKS),
        dataCy: 'links-content-toggle',
      },
      {
        key: CONTENT.FILES,
        label: 'Files',
        icon: Download,
        disabled: isDisabled(CONTENT.FILES),
        dataCy: 'files-content-toggle',
      },
    ],
    [isDisabled],
  );
  return (
    <FilterRadioGroup
      title={'Content'}
      items={items}
      selectedValue={selectedTab}
      defaultValue={defaultSelectedTab}
      onChange={onTabChange}
      dataCy="filter-content-radiogroup"
    />
  );
}
