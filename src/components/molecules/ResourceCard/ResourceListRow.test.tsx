import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceListRow } from './ResourceListRow';

describe('ResourceListRow', () => {
  it('links a web row out in a new tab, named by its name and note', () => {
    render(
      <ul>
        <ResourceListRow
          uri="https://tidal.com/track/1"
          href="https://tidal.com/track/1"
          name="TIDAL"
          note="Found via musicbrainz"
          testId="row"
        />
      </ul>,
    );

    const link = within(screen.getByTestId('row')).getByRole('link');
    expect(link).toHaveAttribute('href', 'https://tidal.com/track/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAccessibleName('TIDAL Found via musicbrainz');
    expect(screen.getByTestId('resource-source-favicon')).toHaveAttribute('src', 'https://tidal.com/favicon.ico');
  });

  it('shows its whole name and note in a tooltip, for a row cut short in the narrow column', () => {
    render(
      <ul>
        <ResourceListRow uri="https://tidal.com/track/1" href={null} name="TIDAL" note="Song" testId="row" />
      </ul>,
    );

    expect(screen.getByTitle('TIDAL · Song')).toBeInTheDocument();
  });

  it('adds where the link came from to the tooltip only', () => {
    render(
      <ul>
        <ResourceListRow
          uri="https://tidal.com/track/1"
          href="https://tidal.com/track/1"
          name="TIDAL"
          note={null}
          source="Found via musicbrainz"
          testId="row"
        />
      </ul>,
    );

    const link = within(screen.getByTestId('row')).getByRole('link');
    expect(link).toHaveAccessibleName('TIDAL');
    expect(link).toHaveAttribute('title', 'TIDAL · Found via musicbrainz');
  });

  it('says a hint in its name and tooltip only, never shown', () => {
    render(
      <ul>
        <ResourceListRow
          uri="https://music.apple.com/song/1"
          href="/resource?uri=https%3A%2F%2Fmusic.apple.com%2Fsong%2F1"
          name="Apple Music"
          note={null}
          hint="Matched by title and length"
          source="Found via itunes_song"
          counts={{ tags: 2, isTagsAtReadLimit: false, replies: 0, posts: 0 }}
          testId="row"
        />
      </ul>,
    );

    const row = screen.getByTestId('row');
    const link = within(row).getAllByRole('link')[0];
    expect(link).toHaveAccessibleName('Apple Music Matched by title and length 2 tags');
    expect(link).toHaveAttribute('title', 'Apple Music · Matched by title and length · 2 tags · Found via itunes_song');
    expect(within(row).getByText('Matched by title and length')).toHaveClass('sr-only');
  });

  it('links a row to an app page in the same tab', () => {
    render(
      <ul>
        <ResourceListRow
          uri="isbn:9781119473862"
          href="/resource?uri=isbn%3A9781119473862"
          name="The bitcoin standard"
          note="Book"
          testId="row"
        />
      </ul>,
    );

    const link = within(screen.getByTestId('row')).getByRole('link');
    expect(link).toHaveAttribute('href', '/resource?uri=isbn%3A9781119473862');
    expect(link).not.toHaveAttribute('target');
    expect(screen.queryByTestId('row-external')).not.toBeInTheDocument();
  });

  it('adds a separate link out on the right, beside the row and not inside it', () => {
    render(
      <ul>
        <ResourceListRow
          uri="https://tidal.com/track/1"
          href="/resource?uri=https%3A%2F%2Ftidal.com%2Ftrack%2F1"
          externalHref="https://tidal.com/track/1"
          name="TIDAL"
          note={null}
          testId="row"
        />
      </ul>,
    );

    const [link, out] = within(screen.getByTestId('row')).getAllByRole('link');
    expect(link).toHaveAttribute('href', '/resource?uri=https%3A%2F%2Ftidal.com%2Ftrack%2F1');
    expect(link).not.toHaveAttribute('target');
    expect(link).toHaveAccessibleName('TIDAL');
    expect(link).toHaveClass('flex-1', 'min-w-0', 'hover:opacity-80');
    expect(out).toBe(screen.getByTestId('row-external'));
    expect(out).toHaveAttribute('href', 'https://tidal.com/track/1');
    expect(out).toHaveAttribute('target', '_blank');
    expect(out).toHaveAttribute('rel', 'noopener noreferrer');
    expect(out).toHaveAccessibleName('Open in TIDAL');
    expect(out).toHaveAttribute('title', 'Open in TIDAL');
    // The app's ghost icon button, its hover made a light circle on the dark sidebar card.
    expect(out).toHaveAttribute('data-slot', 'button');
    expect(out).toHaveClass('size-8', 'shrink-0', 'rounded-full', 'hover:bg-foreground/10', 'hover:text-foreground');
    expect(out).not.toHaveClass('hover:bg-accent/50');
    expect(out).not.toHaveClass('hover:bg-accent');
    expect(out).not.toHaveClass('hover:text-accent-foreground');
    expect(out).not.toHaveClass('size-9');
    // Siblings with their own hover: neither is inside the other, and no group hover joins them.
    expect(link).not.toContainElement(out);
    expect(out).not.toContainElement(link);
    expect(out.parentElement).toBe(link.parentElement);
    expect(out.parentElement).not.toHaveClass('group');
  });

  it('lists a row with nowhere to open as text', () => {
    render(
      <ul>
        <ResourceListRow uri="doi:10.1038/nature12373" href={null} name="DOI" note={null} testId="row" />
      </ul>,
    );

    expect(screen.getByTestId('row').tagName).toBe('LI');
    expect(screen.getByTestId('row')).toHaveTextContent('DOI');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('puts a trailing control under the link, not inside it', () => {
    render(
      <ul>
        <ResourceListRow
          uri="https://de.wikipedia.org/wiki/Berlin"
          href="https://de.wikipedia.org/wiki/Berlin"
          name="Wikipedia"
          note="Deutsch (de)"
          trailing={<button type="button">Language</button>}
          testId="row"
        />
      </ul>,
    );

    const link = within(screen.getByTestId('row')).getByRole('link');
    const button = within(screen.getByTestId('row')).getByRole('button', { name: 'Language' });
    expect(link).not.toContainElement(button);
    expect(link).toHaveClass('w-full');
    expect(screen.getByTestId('row')).toHaveClass('flex', 'flex-col');
  });

  it('keeps the link out on the name’s line, the trailing control under both', () => {
    render(
      <ul>
        <ResourceListRow
          uri="https://de.wikipedia.org/wiki/Berlin"
          href="/resource?uri=https%3A%2F%2Fde.wikipedia.org%2Fwiki%2FBerlin"
          externalHref="https://de.wikipedia.org/wiki/Berlin"
          name="Wikipedia"
          note="Deutsch (de)"
          trailing={<button type="button">Language</button>}
          testId="row"
        />
      </ul>,
    );

    const row = screen.getByTestId('row');
    const [link, out] = within(row).getAllByRole('link');
    const button = within(row).getByRole('button', { name: 'Language' });
    expect(out).toHaveAttribute('href', 'https://de.wikipedia.org/wiki/Berlin');
    expect(out.parentElement).toBe(link.parentElement);
    expect(out.parentElement).toHaveClass('flex', 'w-full', 'items-center');
    expect(out.parentElement).not.toContainElement(button);
    expect(button.parentElement).toHaveClass('pl-10');
    expect(row).toHaveClass('flex', 'flex-col');
  });

  describe('counts', () => {
    const COUNTS = { tags: 1, isTagsAtReadLimit: false, replies: 4, posts: 2 };
    const renderRow = (counts: Parameters<typeof ResourceListRow>[0]['counts']) =>
      render(
        <ul>
          <ResourceListRow
            uri="https://musicbrainz.org/artist/b5416a54"
            href="/resource?uri=https%3A%2F%2Fmusicbrainz.org%2Fartist%2Fb5416a54"
            externalHref="https://musicbrainz.org/artist/b5416a54"
            name="MusicBrainz"
            note={null}
            source="Found via wikidata"
            counts={counts}
            testId="row"
          />
        </ul>,
      );

    it('shows the tags, comments and posts under the name, said in the row’s name and tooltip', () => {
      renderRow(COUNTS);

      const [link, out] = within(screen.getByTestId('row')).getAllByRole('link');
      const line = screen.getByTestId('row-counts');
      expect(link).toContainElement(line);
      expect(out).not.toContainElement(line);
      expect(line).toHaveAttribute('aria-hidden', 'true');
      expect(line).toHaveClass('text-xs', 'text-muted-foreground');
      expect(screen.getByTestId('row-counts-tags')).toHaveTextContent('1');
      expect(screen.getByTestId('row-counts-replies')).toHaveTextContent('4');
      expect(screen.getByTestId('row-counts-posts')).toHaveTextContent('2');
      for (const item of Array.from(line.children)) expect(item.querySelector('svg')).toHaveClass('size-3');
      // Under the name, in the name's column.
      expect(line.parentElement).toBe(screen.getByText('MusicBrainz').parentElement);
      expect(link).toHaveAccessibleName('MusicBrainz 1 tag, 4 comments, 2 posts');
      expect(link).toHaveAttribute('title', 'MusicBrainz · 1 tag, 4 comments, 2 posts · Found via wikidata');
      expect(out).toHaveAccessibleName('Open in MusicBrainz');
    });

    it('shows only the counts that are not 0', () => {
      renderRow({ ...COUNTS, replies: 0, posts: 3 });

      expect(screen.getByTestId('row-counts-tags')).toBeInTheDocument();
      expect(screen.queryByTestId('row-counts-replies')).not.toBeInTheDocument();
      expect(screen.getByTestId('row-counts-posts')).toHaveTextContent('3');
      expect(within(screen.getByTestId('row')).getAllByRole('link')[0]).toHaveAccessibleName(
        'MusicBrainz 1 tag, 3 posts',
      );
    });

    it('marks a tag count at the read limit as a lower bound, as the Tags button does', () => {
      renderRow({ tags: 20, isTagsAtReadLimit: true, replies: 1, posts: 0 });

      expect(screen.getByTestId('row-counts-tags')).toHaveTextContent('20+');
      expect(within(screen.getByTestId('row')).getAllByRole('link')[0]).toHaveAccessibleName(
        'MusicBrainz 20+ tags, 1 comment',
      );
    });

    it.each([
      ['all 0', { tags: 0, isTagsAtReadLimit: false, replies: 0, posts: 0 }],
      ['a link not read or not known (null)', null],
      ['no counts given', undefined],
    ])('shows no counts line for %s', (_, counts) => {
      renderRow(counts);

      expect(screen.queryByTestId('row-counts')).not.toBeInTheDocument();
      const link = within(screen.getByTestId('row')).getAllByRole('link')[0];
      expect(link).toHaveAccessibleName('MusicBrainz');
      expect(link).toHaveAttribute('title', 'MusicBrainz · Found via wikidata');
    });
  });
});
