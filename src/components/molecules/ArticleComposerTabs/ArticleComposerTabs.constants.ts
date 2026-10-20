export const ARTICLE_COMPOSER_TAB = {
  CONTENT: 'content',
  TITLE: 'title',
  HEADER: 'header',
  PREVIEW: 'preview',
} as const;

export type ArticleComposerTab = (typeof ARTICLE_COMPOSER_TAB)[keyof typeof ARTICLE_COMPOSER_TAB];
