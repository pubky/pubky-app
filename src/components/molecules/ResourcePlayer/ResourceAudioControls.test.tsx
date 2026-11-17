import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatClock, ResourceAudioControls } from './ResourceAudioControls';
import { getAudioPlayer } from './resourcePlayer.utils';

const TARGET = getAudioPlayer('https://cdn.example.com/ep182.mp3', {
  from: 'Darknet Diaries',
  image: 'https://cdn.example.com/show.jpg',
  page: '/resource?uri=https%3A%2F%2Fdarknetdiaries.com%2Fepisode%2F182%2F',
});

/** The audio element, with a length and a play/pause the test drives (jsdom plays no media). */
function setUp(props: Partial<Parameters<typeof ResourceAudioControls>[0]> = {}) {
  const onLoadedMetadata = vi.fn();
  render(
    <ResourceAudioControls
      target={TARGET}
      title="182: Episode 182"
      label="Darknet Diaries player: 182: Episode 182"
      takeFocus={() => true}
      onLoadedMetadata={onLoadedMetadata}
      onError={() => {}}
      {...props}
    />,
  );
  const audio = screen.getByTestId('resource-player-audio') as HTMLAudioElement;
  let paused = true;
  Object.defineProperty(audio, 'duration', { configurable: true, value: 3600 });
  Object.defineProperty(audio, 'paused', { configurable: true, get: () => paused });
  const play = vi.fn(() => {
    paused = false;
    audio.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const pause = vi.fn(() => {
    paused = true;
    audio.dispatchEvent(new Event('pause'));
  });
  audio.play = play;
  audio.pause = pause;
  act(() => audio.dispatchEvent(new Event('loadedmetadata')));
  return { audio, play, pause, onLoadedMetadata };
}

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const seek = () => screen.getByRole('slider', { name: 'Seek in 182: Episode 182' }) as HTMLInputElement;

afterEach(() => vi.restoreAllMocks());

describe('ResourceAudioControls', () => {
  it('shows its cover, its title linking to its page, its show, and no browser controls', () => {
    const { audio, onLoadedMetadata } = setUp();

    expect(audio.controls).toBe(false);
    expect(audio).toHaveAttribute('autoplay');
    expect(onLoadedMetadata).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('resource-audio-art')).toHaveAttribute('src', 'https://cdn.example.com/show.jpg');
    expect(screen.getByRole('link', { name: '182: Episode 182' })).toHaveAttribute('href', TARGET.about!.page);
    expect(screen.getByTestId('resource-audio-from')).toHaveTextContent('Darknet Diaries');
    expect(screen.getByTestId('resource-audio-time')).toHaveTextContent('0:00');
    expect(screen.getByTestId('resource-audio-length')).toHaveTextContent('1:00:00');
  });

  it('plays and pauses, the button naming what a press does', () => {
    const { play, pause } = setUp();

    fireEvent.click(button('Play 182: Episode 182'));
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.click(button('Pause 182: Episode 182'));
    expect(pause).toHaveBeenCalledTimes(1);
    expect(button('Play 182: Episode 182')).toBeInTheDocument();
  });

  it('skips back 15 s and forward 30 s, within the file', () => {
    const { audio } = setUp();
    audio.currentTime = 100;

    fireEvent.click(button('Back 15 seconds'));
    expect(audio.currentTime).toBe(85);
    fireEvent.click(button('Forward 30 seconds'));
    expect(audio.currentTime).toBe(115);
    audio.currentTime = 5;
    fireEvent.click(button('Back 15 seconds'));
    expect(audio.currentTime).toBe(0);
    audio.currentTime = 3590;
    fireEvent.click(button('Forward 30 seconds'));
    expect(audio.currentTime).toBe(3600);
  });

  it('seeks with the scrubber, saying where it is', () => {
    const { audio } = setUp();

    expect(seek()).toHaveAttribute('max', '3600');
    fireEvent.change(seek(), { target: { value: '1800' } });
    expect(audio.currentTime).toBe(1800);
    expect(seek()).toHaveAttribute('aria-valuetext', '30:00 of 1:00:00');
    expect(screen.getByTestId('resource-audio-time')).toHaveTextContent('30:00');
  });

  it('keeps the scrubber off until the length is known', () => {
    render(
      <ResourceAudioControls
        target={TARGET}
        title="182: Episode 182"
        label="x"
        onLoadedMetadata={() => {}}
        onError={() => {}}
      />,
    );

    expect(seek()).toBeDisabled();
    expect(screen.getByTestId('resource-audio-length')).toHaveTextContent('--:--');
  });

  it('changes the speed from its menu, the current one checked', async () => {
    const user = userEvent.setup();
    const { audio } = setUp();

    await user.click(button('Speed: 1x'));
    const options = screen.getAllByTestId('resource-audio-speed-option');
    expect(options.map((option) => option.textContent)).toEqual(['1x', '1.25x', '1.5x', '2x']);
    expect(options[0]).toHaveAttribute('aria-current', 'true');
    await user.click(options[2]);
    expect(audio.playbackRate).toBe(1.5);
    expect(button('Speed: 1.5x')).toBeInTheDocument();
  });

  it('takes the focus of the Play that opened it, and works by keyboard in reading order', async () => {
    const user = userEvent.setup();
    const { audio, play } = setUp();

    // The row's Play is gone with the press: its focus is on Play/Pause now.
    expect(button('Play 182: Episode 182')).toHaveFocus();
    await user.keyboard(' ');
    expect(play).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(button('Forward 30 seconds')).toHaveFocus();
    await user.tab();
    expect(button('Speed: 1x')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    await user.tab({ shift: true });
    expect(button('Back 15 seconds')).toHaveFocus();
    await user.tab({ shift: true });
    expect(seek()).toHaveFocus();
    // The scrubber seeks as a range does.
    fireEvent.change(seek(), { target: { value: '61' } });
    expect(audio.currentTime).toBe(61);
    await user.tab({ shift: true });
    expect(screen.getByRole('link', { name: '182: Episode 182' })).toHaveFocus();
  });

  it('leaves the focus where it is when something else holds it', () => {
    render(
      <>
        <button type="button" autoFocus>
          elsewhere
        </button>
        <ResourceAudioControls
          target={TARGET}
          title="182"
          label="x"
          takeFocus={() => true}
          onLoadedMetadata={() => {}}
          onError={() => {}}
        />
      </>,
    );

    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
  });

  it('takes no focus when mounted again without a press', () => {
    render(
      <ResourceAudioControls
        target={TARGET}
        title="182"
        label="x"
        takeFocus={() => false}
        onLoadedMetadata={() => {}}
        onError={() => {}}
      />,
    );

    expect(document.body).toHaveFocus();
  });

  it('opens its page in a new tab where links may not navigate', () => {
    render(
      <ResourceAudioControls
        target={{ ...TARGET, about: { ...TARGET.about, pageTarget: '_blank' } }}
        title="182"
        label="x"
        onLoadedMetadata={() => {}}
        onError={() => {}}
      />,
    );

    expect(screen.getByRole('link', { name: '182' })).toHaveAttribute('target', '_blank');
  });

  it('names a file with no show by its host, its title plain text without a page', () => {
    render(
      <ResourceAudioControls
        target={getAudioPlayer('https://www.example.com/a.mp3')}
        title="A file"
        label="x"
        onLoadedMetadata={() => {}}
        onError={() => {}}
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('resource-audio-title')).toHaveTextContent('A file');
    expect(screen.getByTestId('resource-audio-from')).toHaveTextContent('example.com');
    expect(screen.getByTestId('resource-audio-art-tile')).toBeInTheDocument();
  });
});

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [4, '0:04'],
    [65.9, '1:05'],
    [3723, '1:02:03'],
    [Number.NaN, '0:00'],
    [-3, '0:00'],
  ])('%s s reads %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});
