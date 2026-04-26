'use client';

import * as Atoms from '@/atoms';
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
    <Atoms.FilterRoot className={className}>
      <Atoms.FilterHeader title="Feed" />

      <Atoms.FilterList>
        {feeds.map((feed) => {
          const Icon = feed.icon;
          return (
            <Atoms.FilterItem key={feed.label} isSelected={false} onClick={() => {}}>
              <Atoms.FilterItemIcon icon={Icon} />
              <Atoms.FilterItemLabel>{feed.label}</Atoms.FilterItemLabel>
            </Atoms.FilterItem>
          );
        })}

        {showCreateButton && (
          <Atoms.FilterItem isSelected={false} onClick={() => {}}>
            <Atoms.FilterItemIcon icon={Plus} />
            <Atoms.FilterItemLabel>Create Feed</Atoms.FilterItemLabel>
          </Atoms.FilterItem>
        )}
      </Atoms.FilterList>
    </Atoms.FilterRoot>
  );
}
