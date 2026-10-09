import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '@/atoms/Tabs/Tabs';
import { ArticleComposerTabs } from './ArticleComposerTabs';
import { ARTICLE_COMPOSER_TAB } from './ArticleComposerTabs.constants';

function renderTabs(isMobile: boolean) {
  return render(
    <Tabs value={ARTICLE_COMPOSER_TAB.CONTENT}>
      <ArticleComposerTabs isMobile={isMobile} />
    </Tabs>,
  );
}

describe('ArticleComposerTabs', () => {
  it('renders Content, Header and Preview with visible labels on desktop', () => {
    renderTabs(false);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Content', 'Header', 'Preview']);
    tabs.forEach((tab) => expect(tab.querySelector('span')).not.toHaveClass('sr-only'));
    expect(screen.getByRole('tablist', { name: 'Article sections' })).toBeInTheDocument();
  });

  it('adds a Title tab and hides the labels visually on mobile', () => {
    renderTabs(true);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Content', 'Title', 'Header', 'Preview']);
    tabs.forEach((tab) => expect(tab.querySelector('span')).toHaveClass('sr-only'));
    expect(screen.getByRole('tab', { name: 'Title' })).toHaveAttribute('data-cy', 'article-composer-tab-title');
  });

  it('marks the composer tab the root holds as active', () => {
    renderTabs(false);

    expect(screen.getByRole('tab', { name: 'Content' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false');
  });

  it('renders a real lucide icon in every tab', () => {
    renderTabs(false);

    expect(
      screen.getByRole('tab', { name: 'Content' }).querySelector('svg.lucide-text-align-start'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Header' }).querySelector('svg.lucide-image')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Preview' }).querySelector('svg.lucide-eye')).toBeInTheDocument();
  });
});

describe('ArticleComposerTabs - Snapshots', () => {
  it('matches snapshot on desktop', () => {
    const { container } = renderTabs(false);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot on mobile', () => {
    const { container } = renderTabs(true);
    expect(container.firstChild).toMatchSnapshot();
  });
});
