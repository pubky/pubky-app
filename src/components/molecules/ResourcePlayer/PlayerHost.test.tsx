import { StrictMode, useInsertionEffect } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlayableEpisodes } from '@/molecules/ResourceCard/ResourceCard.utils';
import { ResourceEpisodes } from '@/molecules/ResourceCard/ResourceEpisodes';
import musicFixture from '@/services/pinakes/fixtures/by-uri.music-recording.json';
import type { TPinakesResourceDetail } from '@/services/pinakes/pinakes.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { PlayerFrom, PlayerHost } from './PlayerHost';
import { useCardPlayer } from './useCardPlayer';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const SONG: TPinakesResourceDetail = { ...musicFixture, also_on: [] };
const OTHER_SONG: TPinakesResourceDetail = {
  ...SONG,
  id: 'another-song',
  name: 'Instant Crush',
  uri: 'https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq',
};

function Song({ card = SONG, testId, preview }: { card?: TPinakesResourceDetail; testId: string; preview?: boolean }) {
  const { embed } = useCardPlayer(card, card.uri, undefined, { preview });
  return <section data-testid={testId}>{embed}</section>;
}

/**
 * A page: cards inside `[data-hidden]` are laid out nowhere (a feed behind an open post), cards
 * inside `[data-offscreen]` far below the viewport; any other at the top of the screen.
 */
function layOut() {
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    return asOpaque<DOMRectList>(this.closest('[data-hidden]') ? [] : [{}]);
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const top = this.matches('[data-testid="player-host"]') ? 0 : this.closest('[data-offscreen]') ? 5000 : 100;
    const height = this.matches('[data-testid="player-host"]') ? 0 : 80;
    return { top, bottom: top + height, left: 0, right: 400, width: 400, height, x: 0, y: top } as DOMRect;
  });
}

const frames = () => screen.queryAllByTestId('resource-player-frame');
const slotOf = (testId: string) => within(screen.getByTestId(testId)).getByTestId('player-dock-slot');
const dock = () => screen.queryByRole('complementary', { name: `Player dock: ${SONG.name}` });

/** A press inside a player's frame: the pointer is over it, then the frame takes the focus. */
const press = (frame: HTMLElement) =>
  act(() => {
    fireEvent.mouseOver(frame);
    frame.focus();
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(1);
  });

/** Spotify's own word from inside its frame (`playback_update`): it plays or was paused. */
const tell = (frame: HTMLElement, payload: { isPaused: boolean }) =>
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://open.spotify.com',
        source: (frame as HTMLIFrameElement).contentWindow,
        data: { type: 'playback_update', payload },
      }),
    );
  });

/** A scroll: the host places its frames again at the next frame. */
const scroll = () =>
  act(() => {
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
  });

describe('PlayerHost', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    layOut();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    push.mockReset();
    window.history.replaceState(null, '', '/');
  });

  it('lays each card’s player over the card, in the host, not in the card', () => {
    render(
      <PlayerHost>
        <Song testId="feed" />
      </PlayerHost>,
    );

    const [frame] = frames();
    expect(screen.getByTestId('feed')).not.toContainElement(frame);
    expect(screen.getByTestId('player-host')).toContainElement(frame);
    const box = frame.closest<HTMLElement>('[data-testid="hosted-player"]')!;
    expect(box).toHaveStyle({ top: '100px', left: '0px', width: '400px' });
    // Assistive technology reads it in the card.
    expect(slotOf('feed')).toHaveAttribute('aria-owns', box.id);
    expect(document.querySelector('[data-keep-playing]')).toBeNull();
  });

  it('keeps the same playing frame across pages: the dock with no card, then the next card of the same link', () => {
    const { rerender } = render(
      <PlayerHost>
        <Song key="feed" testId="feed" />
      </PlayerHost>,
    );
    const [frame] = frames();
    press(frame);
    expect(frame.closest('[data-keep-playing]')).not.toBeNull();
    expect(dock()).toBeNull();

    // Another page: the card is gone, its frame plays on in the dock.
    rerender(
      <PlayerHost>
        <p key="profile">Profile</p>
      </PlayerHost>,
    );
    expect(dock()).toContainElement(frame);
    expect(frames()).toEqual([frame]);

    // The feed again: its new card of the same link takes the playing frame instead of loading its own.
    rerender(
      <PlayerHost>
        <Song key="feed-again" testId="feed-again" />
      </PlayerHost>,
    );
    expect(dock()).toBeNull();
    expect(frames()).toEqual([frame]);
    expect(frame.closest('[data-keep-playing]')).not.toBeNull();
    expect(slotOf('feed-again')).toHaveAttribute('aria-owns', frame.closest('[data-testid="hosted-player"]')!.id);
  });

  it('lays the playing frame over the open post’s card of the same link while the feed is hidden, and back', () => {
    const page = (postOpen: boolean) => (
      <PlayerHost>
        <div data-testid="feed" data-hidden={postOpen || undefined}>
          <Song testId="feed-card" />
        </div>
        {postOpen && <Song testId="post-card" />}
      </PlayerHost>
    );
    const { rerender } = render(page(false));
    const [frame] = frames();
    press(frame);

    rerender(page(true));
    expect(frames()).toEqual([frame]);
    expect(dock()).toBeNull();
    const box = frame.closest('[data-testid="hosted-player"]')!;
    expect(slotOf('post-card')).toHaveAttribute('aria-owns', box.id);

    rerender(page(false));
    expect(frames()).toEqual([frame]);
    expect(slotOf('feed-card')).toHaveAttribute('aria-owns', box.id);
    expect(frame.closest('[data-keep-playing]')).not.toBeNull();
  });

  it('never gives the playing frame to a card of another link, which loads its own', () => {
    const { rerender } = render(
      <PlayerHost>
        <Song key="feed" testId="feed" />
      </PlayerHost>,
    );
    const [frame] = frames();
    press(frame);

    rerender(
      <PlayerHost>
        <Song key="other" card={OTHER_SONG} testId="other" />
      </PlayerHost>,
    );
    expect(dock()).toContainElement(frame);
    const other = frames().find((element) => element !== frame)!;
    expect(other).toHaveAttribute('src', 'https://open.spotify.com/embed/track/69kOkLUCkxIZYexIgSG8rq');
    expect(other.closest('[data-keep-playing]')).toBeNull();
  });

  it('closes from the dock: the frame of a card that is gone is unloaded', () => {
    const { rerender } = render(
      <PlayerHost>
        <Song key="feed" testId="feed" />
      </PlayerHost>,
    );
    press(frames()[0]);
    rerender(<PlayerHost>{null}</PlayerHost>);

    fireEvent.click(within(dock()!).getByRole('button', { name: 'Close the Spotify player' }));
    expect(frames()).toEqual([]);
    expect(dock()).toBeNull();
    expect(document.querySelector('[data-keep-playing]')).toBeNull();
  });

  it('still plays one media at a time: another player starting stops and unloads the docked one', () => {
    const { rerender } = render(
      <PlayerHost>
        <Song key="feed" testId="feed" />
      </PlayerHost>,
    );
    const [first] = frames();
    press(first);
    rerender(
      <PlayerHost>
        <Song key="other" card={OTHER_SONG} testId="other" />
      </PlayerHost>,
    );
    const second = frames().find((element) => element !== first)!;

    press(second);
    expect(first).not.toBeInTheDocument();
    expect(dock()).toBeNull();
    expect(Array.from(document.querySelectorAll('[data-keep-playing]'))).toEqual([
      second.closest('[data-keep-playing]'),
    ]);
  });

  it('docks the playing frame when its card scrolls away, with Back scrolling to the card', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const page = (away: boolean) => (
      <PlayerHost>
        <div data-offscreen={away || undefined}>
          <Song testId="feed" />
        </div>
      </PlayerHost>
    );
    const { rerender } = render(page(false));
    const [frame] = frames();
    press(frame);

    rerender(page(true));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    expect(dock()).toContainElement(frame);
    expect(slotOf('feed')).toHaveAttribute('data-docked', 'true');
    fireEvent.click(within(dock()!).getByRole('button', { name: `Back to ${SONG.name}` }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('leads Back to the page the card was first shown on once no card of it is on the page', () => {
    // The router sets the new address in an insertion effect, after the new page has rendered.
    function Navigated({ to }: { to: string }) {
      useInsertionEffect(() => window.history.replaceState(null, '', to), [to]);
      return null;
    }
    window.history.replaceState(null, '', '/home');
    const { rerender } = render(
      <PlayerHost>
        <Navigated to="/resource?uri=x" />
        <Song key="resource" testId="resource" />
      </PlayerHost>,
    );
    press(frames()[0]);
    window.history.replaceState(null, '', '/settings');
    rerender(<PlayerHost>{null}</PlayerHost>);

    fireEvent.click(within(dock()!).getByRole('button', { name: `Back to ${SONG.name}` }));
    expect(push).toHaveBeenCalledWith('/resource?uri=x');
  });

  it('leads Back to the card’s post when it is in one, and to the top when that post is the page', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    window.history.replaceState(null, '', '/home');
    const { rerender } = render(
      <PlayerHost>
        <PlayerFrom key="post" postId="pk:1">
          <Song testId="feed" />
        </PlayerFrom>
      </PlayerHost>,
    );
    press(frames()[0]);
    rerender(<PlayerHost>{null}</PlayerHost>);

    fireEvent.click(within(dock()!).getByRole('button', { name: `Back to ${SONG.name}` }));
    expect(push).toHaveBeenCalledWith('/post/pk/1');

    window.history.replaceState(null, '', '/post/pk/1');
    fireEvent.click(within(dock()!).getByRole('button', { name: `Back to ${SONG.name}` }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('unloads the page’s player when its card shows another resource in place', () => {
    const { rerender } = render(
      <PlayerHost>
        <Song key="feed" testId="feed" />
      </PlayerHost>,
    );
    const [first] = frames();
    press(first);

    rerender(
      <PlayerHost>
        <Song key="feed" card={OTHER_SONG} testId="feed" />
      </PlayerHost>,
    );
    expect(first).not.toBeInTheDocument();
    expect(dock()).toBeNull();
    expect(frames()).toHaveLength(1);
  });

  it('keeps the frame, once, in StrictMode’s double effects', () => {
    const { rerender } = render(
      <StrictMode>
        <PlayerHost>
          <Song key="feed" testId="feed" />
        </PlayerHost>
      </StrictMode>,
    );
    const [frame] = frames();
    expect(frames()).toHaveLength(1);
    press(frame);

    rerender(
      <StrictMode>
        <PlayerHost>{null}</PlayerHost>
      </StrictMode>,
    );
    expect(dock()).toContainElement(frame);
  });

  it('unloads a quiet player hidden with its card behind an open post, and loads it again with the feed', () => {
    const page = (postOpen: boolean) => (
      <PlayerHost>
        <div data-hidden={postOpen || undefined}>
          <Song testId="feed" />
        </div>
      </PlayerHost>
    );
    const { rerender } = render(page(false));
    const [frame] = frames();
    const box = frame.closest('[data-testid="hosted-player"]')!;
    expect(box).not.toHaveClass('hidden');
    act(() => frame.dispatchEvent(new Event('load')));
    expect(within(box as HTMLElement).queryByTestId('resource-player-placeholder')).toBeNull();

    rerender(page(true));
    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });
    // Hidden, it loads nothing: no frame of it is left on the page
    expect(frames()).toEqual([]);
    expect(box).toHaveClass('hidden');
    expect(dock()).toBeNull();

    rerender(page(false));
    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(20);
    });
    expect(frames()).toHaveLength(1);
    expect(box).not.toHaveClass('hidden');
    // A new frame, loading anew: its placeholder covers it until it has loaded, as on the first load.
    const [reloaded] = frames();
    expect(reloaded).not.toBe(frame);
    const region = reloaded.closest('[data-player-region]')!;
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(reloaded).toHaveClass('opacity-0');
    expect(within(box as HTMLElement).getByTestId('resource-player-placeholder')).toBeInTheDocument();
    act(() => reloaded.dispatchEvent(new Event('load')));
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(reloaded).toHaveClass('opacity-100');
    expect(within(box as HTMLElement).queryByTestId('resource-player-placeholder')).toBeNull();
  });

  it('lets a quiet player go with its card, and never docks one', () => {
    const page = (away: boolean, shown = true) => (
      <PlayerHost>
        <div data-offscreen={away || undefined}>{shown && <Song testId="feed" />}</div>
      </PlayerHost>
    );
    const { rerender } = render(page(false));
    const [frame] = frames();

    rerender(page(true));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    expect(dock()).toBeNull();
    expect(frames()).toEqual([frame]);

    rerender(page(true, false));
    expect(frames()).toEqual([]);
  });

  it('keeps a preview’s player (the composer) in place', () => {
    render(
      <PlayerHost>
        <Song testId="composer" preview />
      </PlayerHost>,
    );

    expect(screen.getByTestId('composer')).toContainElement(frames()[0]);
  });

  it('never docks a player paused in its card: it stays over its card off screen, and docks once played on', () => {
    const page = (away: boolean) => (
      <PlayerHost>
        <div data-offscreen={away || undefined}>
          <Song key="feed" testId="feed" />
        </div>
      </PlayerHost>
    );
    const { rerender } = render(page(false));
    const [frame] = frames();
    const box = frame.closest('[data-testid="hosted-player"]')!;
    press(frame);
    tell(frame, { isPaused: true });

    rerender(page(true));
    scroll();
    expect(dock()).toBeNull();
    expect(slotOf('feed')).not.toHaveAttribute('data-docked');
    expect(slotOf('feed')).toHaveAttribute('aria-owns', box.id);
    expect(frames()).toEqual([frame]);

    tell(frame, { isPaused: false });
    scroll();
    expect(dock()).toContainElement(frame);
  });

  it('keeps a player paused in its card hidden with it behind an open post, and closes it once its card is gone', () => {
    const page = (postOpen: boolean, shown = true) => (
      <PlayerHost>
        <div data-hidden={postOpen || undefined}>{shown && <Song key="feed" testId="feed" />}</div>
      </PlayerHost>
    );
    const { rerender } = render(page(false));
    const [frame] = frames();
    const box = frame.closest('[data-testid="hosted-player"]')!;
    press(frame);
    tell(frame, { isPaused: true });

    rerender(page(true));
    scroll();
    expect(dock()).toBeNull();
    expect(frames()).toEqual([frame]);
    expect(box).toHaveClass('hidden');

    rerender(page(false));
    scroll();
    expect(box).not.toHaveClass('hidden');

    // Another page: nothing would show it, so it is closed and unloaded.
    rerender(page(false, false));
    expect(dock()).toBeNull();
    expect(frames()).toEqual([]);
    expect(document.querySelector('[data-keep-playing]')).toBeNull();
  });

  it('keeps a player paused in the dock in the dock, where Close still unloads it', () => {
    const { rerender } = render(
      <PlayerHost>
        <Song key="feed" testId="feed" />
      </PlayerHost>,
    );
    const [frame] = frames();
    press(frame);
    rerender(<PlayerHost>{null}</PlayerHost>);
    expect(dock()).toContainElement(frame);

    tell(frame, { isPaused: true });
    scroll();
    expect(dock()).toContainElement(frame);
    fireEvent.click(within(dock()!).getByRole('button', { name: 'Close the Spotify player' }));
    expect(frames()).toEqual([]);
    expect(dock()).toBeNull();
  });

  describe('a show’s episode', () => {
    const EPISODE = {
      uri: 'https://darknetdiaries.com/episode/181/',
      name: '181: Ricky',
      guid: 'guid-181',
      published: '2026-10-20T08:00:00Z',
      stream: { url: 'https://cdn.example.com/ep181.mp3', type: 'audio/mpeg', duration_s: 4815, preview: false },
    };
    const Episodes = ({ testId }: { testId: string }) => (
      <section data-testid={testId}>
        <ResourceEpisodes episodes={getPlayableEpisodes({ episodes: [EPISODE] })} />
      </section>
    );
    const audios = () => Array.from(document.querySelectorAll('audio'));
    const episodeDock = () => screen.queryByRole('complementary', { name: `Player dock: ${EPISODE.name}` });

    it('loads nothing before Play, then plays in the host and on across pages in the same element, Close unloading it', () => {
      const { rerender } = render(
        <PlayerHost>
          <Episodes key="show" testId="show" />
        </PlayerHost>,
      );
      expect(audios()).toEqual([]);
      expect(screen.getByText('Oct 20, 2026 · 1:20:15')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: `Play ${EPISODE.name}` }));
      const [audio] = audios();
      expect(audio).toHaveAttribute('src', EPISODE.stream.url);
      expect(screen.getByTestId('player-host')).toContainElement(audio);
      expect(audio.closest('[data-keep-playing]')).not.toBeNull();

      // Another page: it plays on in the dock, the same element.
      rerender(<PlayerHost>{null}</PlayerHost>);
      expect(episodeDock()).toContainElement(audio);

      // A card of the same show again: its row shows the playing one, loads no second.
      rerender(
        <PlayerHost>
          <Episodes key="show-again" testId="show-again" />
        </PlayerHost>,
      );
      expect(episodeDock()).toBeNull();
      expect(audios()).toEqual([audio]);
      expect(within(screen.getByTestId('show-again')).queryByRole('button', { name: /^Play / })).toBeNull();

      rerender(<PlayerHost>{null}</PlayerHost>);
      fireEvent.click(within(episodeDock()!).getByRole('button', { name: /^Close the / }));
      expect(audios()).toEqual([]);
      expect(episodeDock()).toBeNull();
    });

    it('shows the playing one in one card of the same show on the next page; the other keeps its Play', () => {
      const { rerender } = render(
        <PlayerHost>
          <Episodes key="show" testId="show" />
        </PlayerHost>,
      );
      fireEvent.click(screen.getByRole('button', { name: `Play ${EPISODE.name}` }));
      const [audio] = audios();

      rerender(
        <PlayerHost>
          <Episodes key="first" testId="first" />
          <Episodes key="second" testId="second" />
        </PlayerHost>,
      );
      expect(audios()).toEqual([audio]);
      expect(episodeDock()).toBeNull();
      const playing = ['first', 'second'].filter(
        (id) => within(screen.getByTestId(id)).queryByRole('button', { name: `Play ${EPISODE.name}` }) === null,
      );
      expect(playing).toHaveLength(1);
      // The host lays the playing one over that row.
      expect(slotOf(playing[0])).toHaveAttribute('aria-owns', audio.closest('[data-testid="hosted-player"]')!.id);
    });

    it('stays in its card once paused there, and stops a service’s player when it starts', () => {
      const page = (away: boolean) => (
        <PlayerHost>
          <Song key="song" testId="song" />
          <div data-offscreen={away || undefined}>
            <Episodes key="show" testId="show" />
          </div>
        </PlayerHost>
      );
      const { rerender } = render(page(false));
      const [song] = frames();
      press(song);

      fireEvent.click(screen.getByRole('button', { name: `Play ${EPISODE.name}` }));
      const [audio] = audios();
      fireEvent.play(audio);
      expect(song.closest('[data-keep-playing]')).toBeNull();

      fireEvent.pause(audio);
      rerender(page(true));
      scroll();
      expect(episodeDock()).toBeNull();
      expect(audios()).toEqual([audio]);
    });
  });
});
