import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMinFrameWidth, getPlayerTarget } from './resourcePlayer.utils';
import { ResourcePlayerFrame } from './ResourcePlayerFrame';

const SHOW = getPlayerTarget('https://podcasts.apple.com/us/podcast/darknet-diaries/id1296350485')!;
const EPISODE = getPlayerTarget('https://podcasts.apple.com/us/podcast/id1415720320?i=1000792990676')!;
const ALBUM = getPlayerTarget('https://music.apple.com/us/album/random-access-memories/617154241')!;
const SONG = getPlayerTarget('https://music.apple.com/us/song/617154366')!;
const SPOTIFY = getPlayerTarget('https://open.spotify.com/track/69kOkLUCkxIZYexIgSG8rq')!;

type Report = (entries: Array<{ contentRect: { width: number } }>) => void;

/** A ResizeObserver that reports the width the test sets, once on `observe()` and on each resize. */
let observers: Report[] = [];
let regionWidth = 0;

class FakeResizeObserver {
  private readonly report: Report;
  constructor(report: Report) {
    this.report = report;
  }
  observe() {
    observers.push(this.report);
    this.report([{ contentRect: { width: regionWidth } }]);
  }
  unobserve() {}
  disconnect() {
    observers = observers.filter((report) => report !== this.report);
  }
}

function resizeTo(width: number) {
  regionWidth = width;
  act(() => observers.forEach((report) => report([{ contentRect: { width } }])));
}

function region() {
  return screen.getByRole('region');
}

describe('ResourcePlayerFrame: an embed with a minimum width', () => {
  beforeEach(() => {
    observers = [];
    regionWidth = 0;
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('knows Apple’s embeds that keep 290 px: Podcasts, and Music’s lists', () => {
    expect(getMinFrameWidth(SHOW)).toBe(290);
    expect(getMinFrameWidth(EPISODE)).toBe(290);
    expect(getMinFrameWidth(ALBUM)).toBe(290);
    // One song fits any card; no other service needs it.
    expect(getMinFrameWidth(SONG)).toBeUndefined();
    expect(getMinFrameWidth(SPOTIFY)).toBeUndefined();
  });

  it('lays an Apple Podcasts frame out at 290 px and scales it, and its region, to a narrower card', () => {
    regionWidth = 278;
    render(<ResourcePlayerFrame target={SHOW} title="Darknet Diaries" load="ready" onLoaded={() => {}} quiet />);

    const scale = 278 / 290;
    const frame = screen.getByTestId('resource-player-frame');
    expect(frame.style.width).toBe('290px');
    expect(frame.style.height).toBe(`${100 / scale}%`);
    expect(frame.style.transform).toBe(`scale(${scale})`);
    expect(frame.style.transformOrigin).toBe('0 0');
    // The region is the scaled player's height: no gap under it, in the card or the dock.
    expect(region()).toHaveClass('h-(--player-h)');
    expect(region().style.getPropertyValue('--player-h')).toBe(`${175 * scale}px`);
    expect(region().style.getPropertyValue('--player-dock-h')).toBe(`${175 * scale}px`);
  });

  it('follows the card’s width, and leaves a wide enough card’s frame as it is', () => {
    regionWidth = 600;
    render(
      <ResourcePlayerFrame target={ALBUM} title="Random Access Memories" load="ready" onLoaded={() => {}} quiet />,
    );
    const frame = screen.getByTestId('resource-player-frame');
    expect(frame.style.transform).toBe('');
    expect(frame.style.width).toBe('');
    expect(region().style.getPropertyValue('--player-h')).toBe('450px');

    resizeTo(232);
    expect(frame.style.transform).toBe(`scale(${232 / 290})`);
    expect(region().style.getPropertyValue('--player-h')).toBe(`${450 * (232 / 290)}px`);

    // Hidden (display: none, e.g. a feed behind an open post) it reports 0 and keeps its scale.
    resizeTo(0);
    expect(frame.style.transform).toBe(`scale(${232 / 290})`);

    resizeTo(290);
    expect(frame.style.transform).toBe('');
    expect(region().style.getPropertyValue('--player-h')).toBe('450px');
  });

  it('never scales a player without a minimum width, or before the width is known', () => {
    regionWidth = 200;
    const { unmount } = render(
      <ResourcePlayerFrame target={SPOTIFY} title="Get Lucky" load="ready" onLoaded={() => {}} quiet />,
    );
    expect(screen.getByTestId('resource-player-frame').style.transform).toBe('');
    expect(region().style.getPropertyValue('--player-h')).toBe('152px');
    unmount();

    regionWidth = 0;
    render(<ResourcePlayerFrame target={SHOW} title="Darknet Diaries" load="ready" onLoaded={() => {}} quiet />);
    expect(screen.getByTestId('resource-player-frame').style.transform).toBe('');
    expect(region().style.getPropertyValue('--player-h')).toBe('175px');
  });
});
