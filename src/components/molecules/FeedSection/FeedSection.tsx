'use client';
import {
  FilterHeader,
  FilterItem,
  FilterItemIcon,
  FilterItemLabel,
  FilterList,
  FilterRoot,
} from '@/atoms/Filter/Filter';

import { Bitcoin, Pickaxe, Zap, Palette, Plus } from 'lucide-react';
import { UsersRound2 } from '@/icons';
export interface FeedItem {
  icon: React.ComponentType<{
    className?: string;
  }>;
  label: string;
  href?: string;
}
export interface FeedSectionProps {
  feeds?: FeedItem[];
  showCreateButton?: boolean;
  className?: string;
}
export function FeedSection({ feeds: customFeeds, showCreateButton = true, className }: FeedSectionProps) {
  const defaultFeeds: FeedItem[] = [
    {
      icon: UsersRound2,
      label: 'Following',
    },
    {
      icon: Bitcoin,
      label: 'Based Bitcoin',
    },
    {
      icon: Pickaxe,
      label: 'Mining Industry',
    },
    {
      icon: Zap,
      label: 'Lightning Network',
    },
    {
      icon: Palette,
      label: 'Design UX/UI',
    },
  ];
  const feeds = customFeeds || defaultFeeds;
  return (
    <FilterRoot className={className}>
      <FilterHeader title="Feed" />

      <FilterList>
        {feeds.map((feed) => {
          const Icon = feed.icon;
          return (
            <FilterItem key={feed.label} isSelected={false} onClick={() => {}}>
              <FilterItemIcon icon={Icon} />
              <FilterItemLabel>{feed.label}</FilterItemLabel>
            </FilterItem>
          );
        })}

        {showCreateButton && (
          <FilterItem isSelected={false} onClick={() => {}}>
            <FilterItemIcon icon={Plus} />
            <FilterItemLabel>Create Feed</FilterItemLabel>
          </FilterItem>
        )}
      </FilterList>
    </FilterRoot>
  );
}
