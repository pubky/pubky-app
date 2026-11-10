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
});
