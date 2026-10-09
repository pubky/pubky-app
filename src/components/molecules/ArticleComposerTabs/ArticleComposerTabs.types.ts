export const ARTICLE_COMPOSER_TAB = {
  CONTENT: 'content',
  TITLE: 'title',
  HEADER: 'header',
  PREVIEW: 'preview',
} as const;

export type ArticleComposerTab = (typeof ARTICLE_COMPOSER_TAB)[keyof typeof ARTICLE_COMPOSER_TAB];

export interface ArticleComposerTabsProps {
  /**
   * Phones split the title out of the content tab and show the tabs as icons alone; wider
   * viewports keep the title with the body and label every tab.
   */
  isMobile: boolean;
  className?: string;
}
