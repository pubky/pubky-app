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
  /**
   * Covers picked this session. One arriving while another tab shows (a file dropped on the body
   * box) would land in the hidden Header panel, so the Header tab is brought up to show it.
   */
  coverCount: number;
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
  coverCount,
}: UseArticleComposerTabOptions): UseArticleComposerTabReturn {
  const [tab, setTab] = useState<ArticleComposerTab>(ARTICLE_COMPOSER_TAB.CONTENT);
  const [wasArticle, setWasArticle] = useState(isArticle);
  const [seenCoverCount, setSeenCoverCount] = useState(coverCount);

  // State adjusted during render (the React-documented alternative to an effect): React re-renders
  // before committing, so no frame ever shows the stale tab
  if (isArticle !== wasArticle) setWasArticle(isArticle);
  let revealHeader = false;
  if (coverCount !== seenCoverCount) {
    setSeenCoverCount(coverCount);
    // Only a cover added while already composing an article: a draft restored together with its
    // cover (an abandoned lock) starts on Content like any other article
    revealHeader = isArticle && wasArticle && coverCount > seenCoverCount && tab !== ARTICLE_COMPOSER_TAB.HEADER;
    if (revealHeader) setTab(ARTICLE_COMPOSER_TAB.HEADER);
  }
  const resetToContent =
    (!isArticle && tab !== ARTICLE_COMPOSER_TAB.CONTENT) || (!isMobile && tab === ARTICLE_COMPOSER_TAB.TITLE);
  if (resetToContent) setTab(ARTICLE_COMPOSER_TAB.CONTENT);

  const isArticleComposerTab = (value: string): value is ArticleComposerTab =>
    Object.values(ARTICLE_COMPOSER_TAB).some((candidate) => candidate === value);

  return {
    value: resetToContent ? ARTICLE_COMPOSER_TAB.CONTENT : revealHeader ? ARTICLE_COMPOSER_TAB.HEADER : tab,
    onValueChange: (value) => {
      if (isArticleComposerTab(value)) setTab(value);
    },
  };
}
