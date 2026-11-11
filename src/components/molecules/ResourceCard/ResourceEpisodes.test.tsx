import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TPinakesEpisode } from '@/services/pinakes/pinakes.types';
import { getPlayableEpisodes } from './ResourceCard.utils';
import { ResourceEpisodes, SHOWN_EPISODES } from './ResourceEpisodes';

const episode = (n: number, overrides: Partial<TPinakesEpisode> = {}): TPinakesEpisode => ({
  uri: `https://darknetdiaries.com/episode/${n}/`,
  name: `${n}: Episode ${n}`,
  published: '2026-11-03T08:00:00Z',
  guid: `guid-${n}`,
  stream: { url: `https://cdn.example.com/ep${n}.mp3`, type: 'audio/mpeg', duration_s: 2357, preview: false },
  ...overrides,
});

const rows = () => screen.queryAllByTestId('resource-card-episode');
const toggle = () => screen.queryByTestId('resource-card-episodes-toggle');

describe('ResourceEpisodes', () => {
  it('lists each episode as Play, its title, date and length, loading nothing before Play', () => {
    render(<ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182)] })} />);

    expect(screen.getByRole('list', { name: 'Latest episodes' })).toBeInTheDocument();
    const [row] = rows();
    expect(row).toHaveTextContent('182: Episode 182');
    // Its whole length from Pinakes, before anything loads (no "0:00 / 0:00").
    expect(row).toHaveTextContent('182: Episode 182Nov 3, 2026 · 39:17');
    expect(row.querySelector('audio, iframe')).toBeNull();
    expect(within(row).getByRole('button', { name: 'Play 182: Episode 182' })).toBeInTheDocument();
    // The list is the card's controls: no click in it opens the resource's page.
    expect(screen.getByTestId('resource-card-episodes')).toHaveAttribute('data-resource-controls');
  });

  it('opens the browser’s player on Play, started by that press, its own length then shown in its controls', () => {
    render(<ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [episode(182), episode(181)] })} />);
    const [row, other] = rows();

    fireEvent.click(within(row).getByRole('button', { name: 'Play 182: Episode 182' }));
    const audio = within(row).getByTestId('resource-player-audio');
    expect(audio).toHaveAttribute('src', 'https://cdn.example.com/ep182.mp3');
    expect(audio).toHaveAttribute('autoplay');
    expect(within(row).queryByRole('button', { name: /^Play / })).not.toBeInTheDocument();
    expect(row).toHaveTextContent('182: Episode 182Nov 3, 2026');
    expect(row).not.toHaveTextContent('39:17');
    // The others wait for their own Play.
    expect(other.querySelector('audio')).toBeNull();
  });

  it('shows the first three, newest first as Pinakes lists them, and the rest behind Show more', () => {
    const episodes = getPlayableEpisodes({ episodes: [182, 181, 180, 179, 178].map((n) => episode(n)) });
    render(<ResourceEpisodes episodes={episodes} />);

    expect(rows()).toHaveLength(SHOWN_EPISODES);
    expect(rows()[0]).toHaveTextContent('182: Episode 182');
    expect(toggle()).toHaveTextContent('Show more');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle()!);
    expect(rows()).toHaveLength(5);
    expect(toggle()).toHaveTextContent('Show less');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle()!);
    expect(rows()).toHaveLength(SHOWN_EPISODES);
  });

  it('has no Show more for three or fewer, and leaves out a date or length it lacks', () => {
    const episodes = getPlayableEpisodes({
      episodes: [
        episode(182, {
          published: null,
          stream: { url: 'https://cdn.example.com/a.mp3', type: 'audio/mpeg', preview: false },
        }),
      ],
    });
    render(<ResourceEpisodes episodes={episodes} />);

    expect(toggle()).not.toBeInTheDocument();
    expect(rows()[0].textContent).toBe('182: Episode 182');
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
