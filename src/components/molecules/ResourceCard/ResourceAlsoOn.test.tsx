import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { MENU_VARIANT } from '@/config/ui';
import articleFixture from '@/services/pinakes/fixtures/by-uri.article.json';
import bookFixture from '@/services/pinakes/fixtures/by-uri.book.json';
import natureArticleFixture from '@/services/pinakes/fixtures/by-uri.nature-article.json';
import placeFixture from '@/services/pinakes/fixtures/by-uri.place.json';
import unreachableFixture from '@/services/pinakes/fixtures/by-uri.unreachable.json';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import type { TPinakesAlsoOn, TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { ResourceAlsoOn } from './ResourceAlsoOn';
import { dedupeAlsoOn } from './ResourceAlsoOn.utils';

const VIDEO: TPinakesResourceDetail = videoFixture;

const rows = () => screen.getAllByTestId('resource-also-on-row');

/**
 * The section as the ⋯ dropdown renders it: inside an open menu, which a followed link closes. The
 * entries come one per service, as the card passes them (`pickAlsoOn`).
 */
function renderAlsoOn(alsoOn: TPinakesAlsoOn[]) {
  render(
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger>More options</DropdownMenuTrigger>
      <DropdownMenuContent data-testid="more-menu">
        <ResourceAlsoOn alsoOn={dedupeAlsoOn(alsoOn)} variant={MENU_VARIANT.DROPDOWN} closeMenu={() => {}} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  return screen.getByTestId('more-menu');
}

/** The section as the ⋯ bottom sheet renders it on a phone. */
function renderSheet(alsoOn: TPinakesAlsoOn[]) {
  const closeMenu = vi.fn();
  render(<ResourceAlsoOn alsoOn={dedupeAlsoOn(alsoOn)} variant={MENU_VARIANT.SHEET} closeMenu={closeMenu} />);
  return { closeMenu };
}

describe('ResourceAlsoOn', () => {
  it('is a section of the menu after a separator: a plain "Also on" label naming one row per service', () => {
    const menu = renderAlsoOn(VIDEO.also_on);

    expect(within(menu).getByRole('separator')).toBeInTheDocument();
    expect(within(menu).getByText('Also on')).toBeInTheDocument();
    const group = within(menu).getByRole('group', { name: 'Also on' });
    // Apple Music and Spotify are listed twice: one row each, the first entry.
    expect(
      within(group)
        .getAllByTestId('resource-also-on-row')
        .map((row) => row.textContent),
    ).toEqual(['TIDAL', 'Apple Music', 'YouTube', 'MusicBrainz', 'Deezer', 'Spotify']);
    expect(screen.getByRole('menuitem', { name: 'Spotify' })).toHaveAttribute('href', VIDEO.also_on[6].uri);
  });

  it('links every web entry out in a new tab, with its site’s favicon', () => {
    renderAlsoOn(VIDEO.also_on);

    const tidal = screen.getByRole('menuitem', { name: 'TIDAL' });
    expect(tidal.tagName).toBe('A');
    expect(tidal).toHaveAttribute('href', 'https://tidal.com/track/490851477');
    expect(tidal).toHaveAttribute('target', '_blank');
    expect(tidal).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(tidal).getByTestId('resource-source-favicon')).toHaveAttribute(
      'src',
      'https://tidal.com/favicon.ico',
    );
  });

  it('shows a globe for a favicon that fails to load, keeping the name', () => {
    renderAlsoOn(VIDEO.also_on);

    const tidal = screen.getByRole('menuitem', { name: 'TIDAL' });
    fireEvent.error(within(tidal).getByTestId('resource-source-favicon'));

    expect(within(tidal).queryByTestId('resource-source-favicon')).not.toBeInTheDocument();
    expect(tidal.querySelector('svg')).toHaveClass('lucide-globe');
    expect(tidal).toHaveTextContent('TIDAL');
  });

  it('names the source a derived link was found through in its accessible name only', () => {
    renderAlsoOn(articleFixture.also_on);

    const britannica = screen.getByRole('menuitem', { name: 'Britannica, Found via wikidata' });
    expect(britannica).toHaveAttribute('href', 'https://www.britannica.com/topic/Bitcoin');
    expect(britannica.textContent).toBe('Britannica');
    // Every row was found via Wikidata; the Wikipedias are one row.
    expect(rows()).toHaveLength(3);
    for (const row of rows()) {
      expect(row).toHaveAccessibleName(/, Found via wikidata$/);
      expect(row.textContent).not.toMatch(/found via/i);
    }
  });

  it('names an archived copy with its capture date', () => {
    renderAlsoOn(unreachableFixture.also_on);

    const archived = screen.getByRole('menuitem', { name: /^Wayback Machine, Archived .*2018 · found via wayback$/ });
    expect(archived).toHaveAttribute('href', unreachableFixture.also_on[0].uri);
    expect(archived.textContent).toBe('Wayback Machine');
  });

  it('lists a URI that is not a web link as text with its identifier icon', () => {
    renderAlsoOn([{ uri: 'isbn:9780140328721' }, { uri: 'javascript:alert(1)', site: 'Script' }]);

    const [isbn, script] = rows();
    for (const row of [isbn, script]) {
      expect(row.tagName).not.toBe('A');
      expect(row.querySelector('a')).toBeNull();
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row.querySelector('[data-testid="resource-source-favicon"]')).toBeNull();
    }
    expect(isbn).toHaveTextContent('9780140328721');
    expect(isbn.querySelector('svg')).toHaveClass('lucide-book-open');
    expect(script).toHaveTextContent('Script');
  });

  it('shows the identifier of a non-web entry named by its service', () => {
    renderAlsoOn(natureArticleFixture.also_on);

    const doi = rows()[0];
    expect(doi).toHaveAttribute('aria-disabled', 'true');
    expect(doi.querySelector('a')).toBeNull();
    expect(doi.textContent).toBe('DOI 10.1038/nature12373');
    expect(doi.querySelector('svg')).toHaveClass('lucide-file-text');
  });

  describe('a service in several languages', () => {
    const wikipedia = () => screen.getByRole('menuitem', { name: /^Wikipedia / });
    const languagesTrigger = () => screen.getByRole('menuitem', { name: 'Change Wikipedia language' });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('is one Wikipedia row, named after the edition it links to', () => {
      const menu = renderAlsoOn(placeFixture.also_on);

      expect(rows().map((row) => row.textContent)).toEqual([
        'Apple Maps',
        'Google Maps',
        'Official website',
        'Tripadvisor',
        'Wikidata',
        'Wikipedia (en)',
      ]);
      expect(within(menu).getAllByText(/^Wikipedia \(/)).toHaveLength(1);
    });

    it('links to the edition in the browser’s language by default', () => {
      vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-CH', 'de', 'en']);
      renderAlsoOn(placeFixture.also_on);

      expect(wikipedia()).toHaveAccessibleName('Wikipedia (de), Found via wikidata');
      expect(wikipedia()).toHaveAttribute('href', 'https://de.wikipedia.org/wiki/Berlin');
      expect(wikipedia()).toHaveAttribute('target', '_blank');
    });

    it('unfolds the languages in the menu as radio items named in their own language', () => {
      renderAlsoOn(placeFixture.also_on);

      expect(languagesTrigger()).toHaveAttribute('role', 'menuitem');
      expect(languagesTrigger()).toHaveAccessibleName('Change Wikipedia language');
      expect(languagesTrigger()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('group', { name: 'Wikipedia language' })).not.toBeInTheDocument();

      fireEvent.click(languagesTrigger());

      expect(screen.getByTestId('more-menu')).toBeInTheDocument();
      expect(languagesTrigger()).toHaveAttribute('aria-expanded', 'true');
      const list = screen.getByRole('group', { name: 'Wikipedia language' });
      expect(languagesTrigger()).toHaveAttribute('aria-controls', list.id);
      const options = within(list).getAllByRole('menuitemradio');
      expect(options).toHaveLength(27);
      expect(within(list).getByRole('menuitemradio', { name: 'English (en)' })).toHaveAttribute('aria-checked', 'true');
      expect(within(list).getByRole('menuitemradio', { name: 'Deutsch (de)' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
      expect(within(list).getByText('Deutsch (de)')).toHaveAttribute('lang', 'de');
      // A list that scrolls on its own, so the rest of the menu stays in reach.
      expect(list).toHaveClass('overflow-y-auto');
    });

    it('changes where the row links when a language is picked, without opening anything', () => {
      renderAlsoOn(placeFixture.also_on);
      fireEvent.click(languagesTrigger());

      const french = screen.getByRole('menuitemradio', { name: 'Français (fr)' });
      expect(french.tagName).not.toBe('A');
      expect(french.querySelector('a')).toBeNull();
      fireEvent.click(french);

      // The menu stays open, the list folds back onto its toggle, and the row now leads to French.
      expect(screen.getByTestId('more-menu')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Wikipedia language' })).not.toBeInTheDocument();
      expect(languagesTrigger()).toHaveAttribute('aria-expanded', 'false');
      expect(languagesTrigger()).toHaveFocus();
      expect(wikipedia()).toHaveAttribute('href', 'https://fr.wikipedia.org/wiki/Berlin');
      expect(wikipedia()).toHaveAccessibleName('Wikipedia (fr), Found via wikidata');
    });

    it('works from the keyboard: Enter unfolds the list and picks a language', () => {
      renderAlsoOn(placeFixture.also_on);

      act(() => languagesTrigger().focus());
      fireEvent.keyDown(languagesTrigger(), { key: 'Enter' });
      const polish = screen.getByRole('menuitemradio', { name: 'Polski (pl)' });
      act(() => polish.focus());
      fireEvent.keyDown(polish, { key: 'Enter' });

      expect(languagesTrigger()).toHaveFocus();
      expect(wikipedia()).toHaveAttribute('href', 'https://pl.wikipedia.org/wiki/Berlin');
    });

    it('opens the list on the checked language, focused and scrolled into the menu’s view', () => {
      const scrollIntoView = vi.fn();
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
      try {
        renderAlsoOn(placeFixture.also_on);
        fireEvent.click(languagesTrigger());

        const english = screen.getByRole('menuitemradio', { name: 'English (en)' });
        expect(english).toHaveFocus();
        expect(scrollIntoView).toHaveBeenCalledTimes(1);
        expect(scrollIntoView.mock.contexts[0]).toBe(english);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      } finally {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    });

    it('gives each service its own row and switcher, named after it', () => {
      const voyage = (lang: string) => ({
        uri: `https://${lang}.wikivoyage.org/wiki/Berlin`,
        site: `Wikivoyage (${lang})`,
      });
      renderAlsoOn([...placeFixture.also_on.slice(5, 8), voyage('de'), voyage('qqq')]);

      expect(rows()).toHaveLength(2);
      expect(screen.getByRole('menuitem', { name: /^Wikivoyage / })).toHaveAttribute(
        'href',
        'https://de.wikivoyage.org/wiki/Berlin',
      );
      fireEvent.click(screen.getByRole('menuitem', { name: 'Change Wikivoyage language' }));

      const list = screen.getByRole('group', { name: 'Wikivoyage language' });
      // A code the runtime cannot name is listed as the code.
      expect(
        within(list)
          .getAllByRole('menuitemradio')
          .map((item) => item.textContent),
      ).toEqual(['Deutsch (de)', 'qqq']);
      expect(screen.getByRole('menuitem', { name: 'Change Wikipedia language' })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });

  describe('in the bottom sheet on a phone', () => {
    const BOOK: TPinakesResourceDetail = bookFixture;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('is a group named "Also on", with plain links that close the sheet once followed', () => {
      const { closeMenu } = renderSheet(BOOK.also_on);

      const group = screen.getByRole('group', { name: 'Also on' });
      expect(within(group).queryByRole('menuitem')).not.toBeInTheDocument();
      // Open Library and Goodreads are listed twice: one row each.
      expect(
        within(group)
          .getAllByTestId('resource-also-on-row')
          .map((row) => row.textContent),
      ).toEqual(['Open Library', 'Amazon', 'Goodreads', 'Internet Archive', 'LibraryThing']);
      const amazon = within(group).getByRole('link', { name: 'Amazon, Found via isbn' });
      expect(amazon).toHaveAttribute('href', 'https://www.amazon.com/dp/0140328726');
      expect(amazon).toHaveAttribute('target', '_blank');
      expect(within(amazon).getByTestId('resource-source-favicon')).toBeInTheDocument();

      fireEvent.click(amazon);

      expect(closeMenu).toHaveBeenCalledTimes(1);
    });

    it('lists a URI that is not a web link as text', () => {
      renderSheet([{ uri: 'isbn:9780140328721' }]);

      const [isbn] = rows();
      expect(isbn.tagName).not.toBe('A');
      expect(isbn.querySelector('a')).toBeNull();
      expect(isbn).not.toHaveAttribute('aria-disabled');
      expect(isbn).toHaveTextContent('9780140328721');
    });

    it('unfolds the languages by touch as a radio group and picks one without closing the sheet', () => {
      const { closeMenu } = renderSheet(placeFixture.also_on);
      const toggle = screen.getByRole('button', { name: 'Change Wikipedia language' });
      const wikipedia = () => screen.getByRole('link', { name: /^Wikipedia / });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      const list = screen.getByRole('radiogroup', { name: 'Wikipedia language' });
      expect(toggle).toHaveAttribute('aria-controls', list.id);
      expect(list).toHaveClass('overflow-y-auto');
      expect(within(list).getAllByRole('radio')).toHaveLength(27);
      const english = within(list).getByRole('radio', { name: 'English (en)' });
      expect(english).toHaveAttribute('aria-checked', 'true');
      expect(english).toHaveFocus();
      expect(within(list).getByText('Deutsch (de)')).toHaveAttribute('lang', 'de');

      fireEvent.click(within(list).getByRole('radio', { name: 'Français (fr)' }));

      expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveFocus();
      expect(wikipedia()).toHaveAttribute('href', 'https://fr.wikipedia.org/wiki/Berlin');
      expect(closeMenu).not.toHaveBeenCalled();
    });

    it('makes the languages one Tab stop that the arrow keys move through without picking', () => {
      renderSheet(placeFixture.also_on);
      fireEvent.click(screen.getByRole('button', { name: 'Change Wikipedia language' }));
      const list = screen.getByRole('radiogroup', { name: 'Wikipedia language' });
      const radios = within(list).getAllByRole('radio');
      const english = within(list).getByRole('radio', { name: 'English (en)' });
      const index = radios.indexOf(english);

      expect(radios.filter((radio) => radio.tabIndex === 0)).toEqual([english]);

      fireEvent.keyDown(english, { key: 'ArrowDown' });
      expect(radios[index + 1]).toHaveFocus();
      fireEvent.keyDown(radios[index + 1], { key: 'ArrowUp' });
      expect(english).toHaveFocus();
      fireEvent.keyDown(english, { key: 'End' });
      expect(radios[radios.length - 1]).toHaveFocus();
      fireEvent.keyDown(radios[radios.length - 1], { key: 'ArrowDown' });
      expect(radios[0]).toHaveFocus();

      // Moving focus picks nothing: the list stays open on English.
      expect(screen.getByRole('radiogroup')).toBe(list);
      expect(english).toHaveAttribute('aria-checked', 'true');
    });
  });
});
