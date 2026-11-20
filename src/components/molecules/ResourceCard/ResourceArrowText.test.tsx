import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceArrowText } from './ResourceArrowText';
import { ResourceCard } from './ResourceCard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: () => ({ metadata: null, isLoading: false, error: null }),
}));

const arrows = (container: HTMLElement) => Array.from(container.querySelectorAll('[data-testid="resource-arrow"]'));
const srWords = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.sr-only')).map((node) => node.textContent);

describe('ResourceArrowText', () => {
  it('leaves a text without arrows as it is', () => {
    const { container } = render(<ResourceArrowText text="4,691 cards · German" />);
    expect(container.innerHTML).toBe('4,691 cards · German');
  });

  it('draws the arrow between two words as a hidden icon and says "to" for it', () => {
    const { container } = render(<ResourceArrowText text="131 inputs → 1 output" />);
    const [icon, ...more] = arrows(container);
    expect(more).toHaveLength(0);
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('lucide-arrow-right', 'size-[1em]', 'inline');
    expect(srWords(container)).toEqual(['to']);
    expect(container.textContent).toBe('131 inputs to 1 output');
    expect(container.textContent).not.toContain('→');
    // The gap before the arrow sits on the space, so a line that wraps there starts flush with the arrow.
    expect(icon).not.toHaveClass('mx-[0.2em]');
    expect(icon.previousElementSibling).toHaveClass('mr-[0.2em]');
    expect(icon.previousElementSibling?.textContent).toBe(' ');
  });

  it('adds no word for an arrow at the start or end of a link label', () => {
    render(
      <>
        <a href="/previous">
          <ResourceArrowText text="← Block 481,823" />
        </a>
        <a href="/next">
          <ResourceArrowText text="Block 481,825 →" />
        </a>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Block 481,823' })).toHaveAttribute('href', '/previous');
    expect(screen.getByRole('link', { name: 'Block 481,825' })).toHaveAttribute('href', '/next');
    expect(document.querySelector('.lucide-arrow-left')).not.toBeNull();
    expect(document.querySelectorAll('.sr-only')).toHaveLength(0);
  });

  it('says "and" for an arrow that stands alone between two parts', () => {
    const { container } = render(<ResourceArrowText text="↔" />);
    expect(container.querySelector('.lucide-arrow-left-right')).toHaveClass('mx-[0.2em]');
    expect(srWords(container)).toEqual(['and']);
  });

  it("draws the arrow in a card's summary line", () => {
    const deck: TPinakesResourceDetail = {
      ...articleFixture,
      type: 'LearningResource',
      type_path: ['Thing', 'CreativeWork', 'LearningResource'],
      facts: { card_count: '4374', front_lang: 'pt-BR', back_lang: 'en-US' },
    };
    render(<ResourceCard card={deck} />);

    const summary = screen.getByTestId('resource-card-summary');
    expect(arrows(summary)).toHaveLength(1);
    expect(summary.textContent).toBe('4,374 cards · Brazilian Portuguese to American English');
  });
});
