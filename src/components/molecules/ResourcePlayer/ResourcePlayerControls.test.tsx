import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlayerTarget } from './resourcePlayer.utils';
import { PlayerDock, PlayOnSplit } from './ResourcePlayerControls';
import type { ResourcePlayerState } from './useResourcePlayer';

const SPOTIFY = getPlayerTarget('https://open.spotify.com/track/1YQWosTIljIvxAgHWTp7KP')!;
const TIDAL = getPlayerTarget('https://tidal.com/browse/track/77646168')!;

let report: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

class MockIntersectionObserver {
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    report = callback;
  }

  observe = vi.fn();
  disconnect = vi.fn();
}

describe('PlayerDock', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    report = null;
  });

  const renderDock = (onClose = vi.fn()) => {
    render(
      <PlayerDock target={SPOTIFY} title="Get Lucky" onClose={onClose}>
        <iframe title="player" />
      </PlayerDock>,
    );
    return onClose;
  };

  it('keeps the player in the card while it is in view, marked to keep playing off screen', () => {
    renderDock();

    expect(screen.getByTestId('player-dock-slot')).not.toHaveAttribute('data-docked');
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByTitle('player').closest('[data-keep-playing]')).not.toBeNull();
  });

  it('moves the same player into the dock when the card scrolls away, and back when it returns', () => {
    renderDock();
    const frame = screen.getByTitle('player');

    act(() => report?.([{ isIntersecting: false }]));
    const dock = screen.getByRole('complementary', { name: 'Player dock: Get Lucky' });
    expect(dock).toContainElement(frame);
    expect(dock).toHaveAttribute('data-docked', 'true');
    expect(screen.getByTestId('player-dock-slot')).toHaveAttribute('data-docked', 'true');

    act(() => report?.([{ isIntersecting: true }]));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByTitle('player')).toBe(frame);
  });

  it('never docks a player shown up front that nobody started (`dockable` off), nor keeps it playing off screen', () => {
    render(
      <PlayerDock target={SPOTIFY} title="Get Lucky" onClose={vi.fn()} dockable={false}>
        <iframe title="player" />
      </PlayerDock>,
    );

    act(() => report?.([{ isIntersecting: false }]));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-dock-slot')).not.toHaveAttribute('data-docked');
    expect(screen.getByTitle('player').closest('[data-keep-playing]')).toBeNull();
  });

  it('closes the player from the dock, and scrolls back to the card', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    const onClose = renderDock();
    act(() => report?.([{ isIntersecting: false }]));

    const dock = screen.getByRole('complementary', { name: 'Player dock: Get Lucky' });
    fireEvent.click(within(dock).getByRole('button', { name: 'Back to Get Lucky' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dock).getByRole('button', { name: 'Close the Spotify player' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves an icon-only way back in the card’s place, with no visible text', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    renderDock();
    act(() => report?.([{ isIntersecting: false }]));

    const back = screen.getByTestId('player-dock-slot-back');
    expect(back).toHaveAccessibleName('Back to Get Lucky');
    expect(back.textContent?.trim()).toBe('');
    fireEvent.click(back);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});

describe('PlayOnSplit', () => {
  const playerState = (current: ResourcePlayerState['current'] = null): ResourcePlayerState => ({
    current,
    load: 'ready',
    play: vi.fn(),
    close: vi.fn(),
    onLoaded: vi.fn(),
  });

  it('is one icon pill, ▶ and the logo, with no chevron when there is no other service', () => {
    const player = playerState();
    render(<PlayOnSplit targets={[SPOTIFY]} player={player} />);

    const main = screen.getByRole('button', { name: 'Play on Spotify' });
    expect(main).toHaveAttribute('title', 'Play on Spotify');
    expect(main.textContent?.trim()).toBe('');
    expect(screen.queryByTestId('play-on-trigger')).toBeNull();
    fireEvent.click(main);
    expect(player.play).toHaveBeenCalledWith(SPOTIFY);
  });

  it('while playing, shows the logo and ✕ that closes, and a chevron when there is another service', () => {
    const player = playerState(TIDAL);
    render(<PlayOnSplit targets={[SPOTIFY, TIDAL]} player={player} />);

    const main = screen.getByRole('button', { name: 'Close the TIDAL player' });
    expect(main).toHaveAttribute('title', 'Close the TIDAL player');
    expect(main.querySelector('.lucide-x')).not.toBeNull();
    expect(main.querySelector('.lucide-play')).toBeNull();
    expect(screen.getByRole('button', { name: 'Play on another service' })).toBe(screen.getByTestId('play-on-trigger'));
    fireEvent.pointerDown(screen.getByTestId('play-on-trigger'), { button: 0, ctrlKey: false });
    expect(screen.getByTestId('play-on-menu')).toHaveAttribute('aria-label', 'Play on');
    fireEvent.keyDown(screen.getByTestId('play-on-menu'), { key: 'Escape' });
    fireEvent.click(main);
    expect(player.close).toHaveBeenCalledTimes(1);
  });

  it('uses the action row’s pill style: filled with the card colour on a card, the post’s on the resource page', () => {
    const { unmount } = render(<PlayOnSplit targets={[SPOTIFY, TIDAL]} player={playerState()} />);
    expect(screen.getByTestId('play-on-main')).toHaveClass('bg-card');
    expect(screen.getByTestId('play-on-trigger')).toHaveClass('bg-card');
    unmount();

    render(<PlayOnSplit targets={[SPOTIFY, TIDAL]} player={playerState()} surface="default" />);
    expect(screen.getByTestId('play-on-main')).not.toHaveClass('bg-card');
    expect(screen.getByTestId('play-on-trigger')).not.toHaveClass('bg-card');
  });
});
