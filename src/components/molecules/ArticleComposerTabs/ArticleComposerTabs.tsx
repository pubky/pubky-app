'use client';

import { Eye, Image as ImageIcon, type LucideIcon, TextAlignStart, Type } from 'lucide-react';
import { TabsList, TabsTrigger } from '@/atoms/Tabs/Tabs';
import { cn } from '@/libs/utils/utils';
import { ARTICLE_COMPOSER_TAB, type ArticleComposerTab } from './ArticleComposerTabs.constants';
import type { ArticleComposerTabsProps } from './ArticleComposerTabs.types';

const TAB_UI: Record<ArticleComposerTab, { label: string; Icon: LucideIcon }> = {
  [ARTICLE_COMPOSER_TAB.CONTENT]: { label: 'Content', Icon: TextAlignStart },
  [ARTICLE_COMPOSER_TAB.TITLE]: { label: 'Title', Icon: Type },
  [ARTICLE_COMPOSER_TAB.HEADER]: { label: 'Header', Icon: ImageIcon },
  [ARTICLE_COMPOSER_TAB.PREVIEW]: { label: 'Preview', Icon: Eye },
};

const DESKTOP_TABS: readonly ArticleComposerTab[] = [
  ARTICLE_COMPOSER_TAB.CONTENT,
  ARTICLE_COMPOSER_TAB.HEADER,
  ARTICLE_COMPOSER_TAB.PREVIEW,
];

const MOBILE_TABS: readonly ArticleComposerTab[] = [
  ARTICLE_COMPOSER_TAB.CONTENT,
  ARTICLE_COMPOSER_TAB.TITLE,
  ARTICLE_COMPOSER_TAB.HEADER,
  ARTICLE_COMPOSER_TAB.PREVIEW,
];

/**
 * The tab row of the article composer. Renders only the triggers: the `Tabs` root (and the
 * panels) belong to the composer, which owns the active tab.
 */
export function ArticleComposerTabs({ isMobile, className }: ArticleComposerTabsProps) {
  const tabs = isMobile ? MOBILE_TABS : DESKTOP_TABS;

  return (
    <TabsList
      aria-label="Article sections"
      className={cn('cursor-auto', className)}
      data-testid="article-composer-tabs"
    >
      {tabs.map((tab) => {
        const { label, Icon } = TAB_UI[tab];
        return (
          <TabsTrigger key={tab} value={tab} data-cy={`article-composer-tab-${tab}`}>
            <Icon aria-hidden="true" />
            {/* Phones show the icon alone; the label stays in the tree for assistive tech */}
            <span className={cn(isMobile && 'sr-only')}>{label}</span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}
