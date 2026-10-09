'use client';

import { useState } from 'react';
import {
  ARTICLE_COMPOSER_TAB,
  type ArticleComposerTab,
} from '@/molecules/ArticleComposerTabs/ArticleComposerTabs.constants';

interface UseArticleComposerTabOptions {
  /** Article mode of the composer. Leaving it forgets the tab, so the next article starts on Content. */
  isArticle: boolean;
  /** Only phones have a Title tab; a Title selection carried across the breakpoint becomes Content. */
  isMobile: boolean;
}

interface UseArticleComposerTabReturn {
  value: ArticleComposerTab;
  onValueChange: (value: string) => void;
}

/**
 * The article composer's active tab. Both corrections write the state rather than mapping it on the
 * way out: a mapped value would leave the stale selection behind, and Radix skips `onValueChange`
 * when the user re-selects the tab that already shows, so nothing would ever repair it.
 */
export function useArticleComposerTab({
  isArticle,
  isMobile,
}: UseArticleComposerTabOptions): UseArticleComposerTabReturn {
  const [tab, setTab] = useState<ArticleComposerTab>(ARTICLE_COMPOSER_TAB.CONTENT);

  // State adjusted during render (the React-documented alternative to an effect): React re-renders
  // before committing, so no frame ever shows the stale tab
  const resetToContent =
    (!isArticle && tab !== ARTICLE_COMPOSER_TAB.CONTENT) || (!isMobile && tab === ARTICLE_COMPOSER_TAB.TITLE);
  if (resetToContent) setTab(ARTICLE_COMPOSER_TAB.CONTENT);

  const isArticleComposerTab = (value: string): value is ArticleComposerTab =>
    Object.values(ARTICLE_COMPOSER_TAB).some((candidate) => candidate === value);

  return {
    value: resetToContent ? ARTICLE_COMPOSER_TAB.CONTENT : tab,
    onValueChange: (value) => {
      if (isArticleComposerTab(value)) setTab(value);
    },
  };
}
