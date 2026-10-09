import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ARTICLE_COMPOSER_TAB } from '@/molecules/ArticleComposerTabs/ArticleComposerTabs.constants';
import { useArticleComposerTab } from './useArticleComposerTab';

function renderTab(initial: { isArticle: boolean; isMobile: boolean } = { isArticle: true, isMobile: false }) {
  return renderHook((props: { isArticle: boolean; isMobile: boolean }) => useArticleComposerTab(props), {
    initialProps: initial,
  });
}

describe('useArticleComposerTab', () => {
  it('starts on Content', () => {
    const { result } = renderTab();

    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.CONTENT);
  });

  it('switches to the tab the user selects', () => {
    const { result } = renderTab();

    act(() => result.current.onValueChange(ARTICLE_COMPOSER_TAB.PREVIEW));

    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.PREVIEW);
  });

  it('ignores a value that is not a composer tab', () => {
    const { result } = renderTab();

    act(() => result.current.onValueChange('drafts'));

    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.CONTENT);
  });

  it('forgets the tab when article mode ends, so the next article starts on Content', () => {
    const { result, rerender } = renderTab();
    act(() => result.current.onValueChange(ARTICLE_COMPOSER_TAB.PREVIEW));

    rerender({ isArticle: false, isMobile: false });
    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.CONTENT);

    rerender({ isArticle: true, isMobile: false });
    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.CONTENT);
  });

  it('turns a Title selection into Content when the viewport widens past the phone breakpoint', () => {
    const { result, rerender } = renderTab({ isArticle: true, isMobile: true });
    act(() => result.current.onValueChange(ARTICLE_COMPOSER_TAB.TITLE));
    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.TITLE);

    rerender({ isArticle: true, isMobile: false });
    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.CONTENT);

    // The correction is written back: narrowing again does not resurrect the Title tab
    rerender({ isArticle: true, isMobile: true });
    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.CONTENT);
  });

  it('keeps a Title selection on a phone', () => {
    const { result, rerender } = renderTab({ isArticle: true, isMobile: true });
    act(() => result.current.onValueChange(ARTICLE_COMPOSER_TAB.TITLE));

    rerender({ isArticle: true, isMobile: true });

    expect(result.current.value).toBe(ARTICLE_COMPOSER_TAB.TITLE);
  });
});
