import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostPreviewNavigableProvider } from '@/molecules/PostPreviewCard/PostPreviewNestingContext';
import type { TPinakesEpisode } from '@/services/pinakes/pinakes.types';
import { getPlayableEpisodes } from './ResourceCard.utils';
import { CARD_EPISODES, ResourceEpisodes } from './ResourceEpisodes';

const SHOW = {
  uri: 'https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485',
  name: 'Darknet Diaries',
  image: 'https://cdn.example.com/show.jpg',
};

const episode = (n: number, overrides: Partial<TPinakesEpisode> = {}): TPinakesEpisode => ({
  uri: `https://darknetdiaries.com/episode/${n}/`,
  name: `${n}: Episode ${n}`,
  published: '2026-11-03T08:00:00Z',
  guid: `guid-${n}`,
  stream: { url: `https://cdn.example.com/ep${n}.mp3`, type: 'audio/mpeg', duration_s: 2357, preview: false },
  ...overrides,
});

const rows = () => screen.queryAllByTestId('resource-card-episode');
const route = (uri: string) => `/resource?uri=${encodeURIComponent(uri)}`;

describe('ResourceEpisodes', () => {
  it('lists each episode as Play, its title, date and length, loading nothing before Play', () => {
    render(<ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182)] })} show={SHOW} />);

    expect(screen.getByRole('list', { name: 'Latest episodes' })).toBeInTheDocument();
    const [row] = rows();
    // Its whole length from Pinakes, before anything loads (no "0:00 / 0:00").
    expect(row).toHaveTextContent('182: Episode 182Nov 3, 2026 · 39:17');
    expect(row.querySelector('audio, iframe')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Play 182: Episode 182' })).toBeInTheDocument();
    // The list is the card's controls: no click in it opens the show's page.
    expect(screen.getByTestId('resource-card-episodes')).toHaveAttribute('data-resource-controls');
  });

  it('leads with the newest (its title on two lines, its cover after it), then the next two, with no Show more', () => {
    const episodes = getPlayableEpisodes({ episodes: [182, 181, 180, 179, 178].map((n) => episode(n)) });
    render(<ResourceEpisodes episodes={episodes} show={SHOW} />);

    expect(rows()).toHaveLength(CARD_EPISODES);
    expect(rows().map((row) => within(row).getByTestId('play-stand-in-title').textContent)).toEqual([
      '182: Episode 182',
      '181: Episode 181',
      '180: Episode 180',
    ]);
    const [lead, next] = rows();
    // The show's cover stands in for an episode without its own image.
    expect(within(lead).getByTestId('resource-audio-art')).toHaveAttribute('src', SHOW.image);
    expect(within(lead).getByTestId('play-stand-in-title')).toHaveClass('line-clamp-2');
    expect(within(next).queryByTestId('resource-audio-art')).toBeNull();
    expect(within(next).getByTestId('play-stand-in-title')).toHaveClass('truncate');
    expect(screen.queryByRole('button', { name: /Show (more|less)/ })).not.toBeInTheDocument();
  });

  it('uses an episode’s own image over the show’s', () => {
    const episodes = getPlayableEpisodes({ episodes: [episode(182, { image: 'https://cdn.example.com/182.jpg' })] });
    render(<ResourceEpisodes episodes={episodes} show={SHOW} />);

    expect(screen.getByTestId('resource-audio-art')).toHaveAttribute('src', 'https://cdn.example.com/182.jpg');
  });

  it('opens each episode’s own resource page from its title, which covers the row but not Play', () => {
    render(<ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182), episode(181)] })} show={SHOW} />);

    const [row] = rows();
    const link = within(row).getByRole('link', { name: '182: Episode 182' });
    expect(link).toHaveAttribute('href', route('https://darknetdiaries.com/episode/182/'));
    expect(link).not.toHaveAttribute('target');
    // The link's box covers the row; Play sits above it and is not inside it.
    expect(link).toHaveClass('after:absolute', 'after:inset-0');
    const play = within(row).getByRole('button', { name: 'Play 182: Episode 182' });
    expect(link.contains(play)).toBe(false);
    expect(play).toHaveClass('relative', 'z-10');
  });

  it('opens an episode’s page in a new tab where links may not navigate', () => {
    render(
      <PostPreviewNavigableProvider navigable={false}>
        <ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182)] })} show={SHOW} />
      </PostPreviewNavigableProvider>,
    );

    expect(screen.getByRole('link', { name: '182: Episode 182' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'All episodes' })).toHaveAttribute('target', '_blank');

    // Played, the player's title opens it in a new tab too
    fireEvent.click(screen.getByRole('button', { name: 'Play 182: Episode 182' }));
    expect(
      within(screen.getByTestId('resource-audio-controls')).getByRole('link', { name: '182: Episode 182' }),
    ).toHaveAttribute('target', '_blank');
  });

  it('plays an episode in place on Play: the app’s player replaces its row, the page stays', () => {
    const before = window.location.href;
    render(<ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182), episode(181)] })} show={SHOW} />);
    const [row, other] = rows();

    fireEvent.click(within(row).getByRole('button', { name: 'Play 182: Episode 182' }));
    expect(window.location.href).toBe(before);
    const audio = within(row).getByTestId('resource-player-audio');
    expect(audio).toHaveAttribute('src', 'https://cdn.example.com/ep182.mp3');
    expect(audio).toHaveAttribute('autoplay');
    const controls = within(row).getByTestId('resource-audio-controls');
    expect(within(controls).getByRole('link', { name: '182: Episode 182' })).toHaveAttribute(
      'href',
      route('https://darknetdiaries.com/episode/182/'),
    );
    expect(within(controls).getByTestId('resource-audio-from')).toHaveTextContent('Darknet Diaries');
    // The stand-in row is gone: its title shows once, in the player, whose Pause has the press's focus.
    expect(within(row).queryByTestId('play-stand-in-title')).toBeNull();
    expect(within(controls).getByTestId('resource-audio-toggle')).toHaveFocus();
    // The others wait for their own Play.
    expect(other.querySelector('audio')).toBeNull();
  });

  it('ends with All episodes, opening the show’s page at its Episodes section', () => {
    render(<ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182)] })} show={SHOW} />);

    expect(screen.getByRole('link', { name: 'All episodes' })).toHaveAttribute('href', `${route(SHOW.uri)}#episodes`);
  });

  it('leaves out a date or length it lacks', () => {
    const episodes = getPlayableEpisodes({
      episodes: [
        episode(182, {
          published: null,
          stream: { url: 'https://cdn.example.com/a.mp3', type: 'audio/mpeg', preview: false },
        }),
      ],
    });
    render(<ResourceEpisodes episodes={episodes} show={SHOW} />);

    expect(within(rows()[0]).getByTestId('play-stand-in-title').parentElement!.textContent).toBe('182: Episode 182');
  });
});

describe('getPlayableEpisodes', () => {
  it('keeps only episodes with http(s) audio, in order', () => {
    const episodes = [
      episode(182),
      episode(181, { stream: { url: 'https://cdn.example.com/ep181.mp4', type: 'video/mp4', preview: false } }),
      episode(180, { stream: null }),
      episode(179, { stream: { url: 'javascript:alert(1)', type: 'audio/mpeg', preview: false } }),
      episode(178),
    ];
    expect(getPlayableEpisodes({ episodes }).map(({ episode: { guid } }) => guid)).toEqual(['guid-182', 'guid-178']);
    expect(getPlayableEpisodes({})).toEqual([]);
    expect(getPlayableEpisodes({ episodes: null })).toEqual([]);
  });
});
