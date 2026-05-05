import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Audio } from './Audio';

describe('Audio', () => {
  it('renders with required props', () => {
    render(<Audio src="/test-audio.mp3" data-testid="test-audio" />);
    const audio = screen.getByTestId('test-audio');
    expect(audio).toBeInTheDocument();
  });

  it('renders with correct src attribute', () => {
    render(<Audio src="/song.mp3" data-testid="audio" />);
    const audio = screen.getByTestId('audio') as HTMLAudioElement;
    expect(audio.src).toContain('/song.mp3');
  });

  it('applies custom className', () => {
    render(<Audio src="/audio.mp3" className="custom-class" data-testid="custom-audio" />);
    const audio = screen.getByTestId('custom-audio');
    expect(audio).toHaveClass('custom-class');
  });

  it('applies default classes', () => {
    render(<Audio src="/audio.mp3" data-testid="default-audio" />);
    const audio = screen.getByTestId('default-audio');
    expect(audio).toHaveClass('w-full');
  });

  it('renders with controls by default', () => {
    render(<Audio src="/audio.mp3" data-testid="audio-controls" />);
    const audio = screen.getByTestId('audio-controls') as HTMLAudioElement;
    expect(audio.controls).toBe(true);
  });

  it('can disable controls', () => {
    render(<Audio src="/audio.mp3" controls={false} data-testid="audio-no-controls" />);
    const audio = screen.getByTestId('audio-no-controls') as HTMLAudioElement;
    expect(audio.controls).toBe(false);
  });

  it('renders with autoPlay attribute', () => {
    render(<Audio src="/audio.mp3" autoPlay data-testid="audio-autoplay" />);
    const audio = screen.getByTestId('audio-autoplay') as HTMLAudioElement;
    expect(audio.autoplay).toBe(true);
  });

  it('renders with loop attribute', () => {
    render(<Audio src="/audio.mp3" loop data-testid="audio-loop" />);
    const audio = screen.getByTestId('audio-loop') as HTMLAudioElement;
    expect(audio.loop).toBe(true);
  });

  it('renders with muted attribute', () => {
    render(<Audio src="/audio.mp3" muted data-testid="audio-muted" />);
    const audio = screen.getByTestId('audio-muted') as HTMLAudioElement;
    expect(audio.muted).toBe(true);
  });

  it('renders with preload attribute', () => {
    render(<Audio src="/audio.mp3" preload="metadata" data-testid="audio-preload" />);
    const audio = screen.getByTestId('audio-preload') as HTMLAudioElement;
    expect(audio.preload).toBe('metadata');
  });

  it('uses default data-testid when not provided', () => {
    render(<Audio src="/audio.mp3" />);
    const audio = screen.getByTestId('audio');
    expect(audio).toBeInTheDocument();
  });

  it('forwards ref correctly as a ref object', () => {
    const ref = createRef<HTMLAudioElement>();
    render(<Audio src="/audio.mp3" ref={ref} data-testid="ref-audio" />);
    const audio = screen.getByTestId('ref-audio');
    expect(ref.current).toBe(audio);
  });

  it('forwards ref correctly as a callback function', () => {
    const refCallback = vi.fn();
    render(<Audio src="/audio.mp3" ref={refCallback} data-testid="callback-ref-audio" />);
    const audio = screen.getByTestId('callback-ref-audio');
    expect(refCallback).toHaveBeenCalledWith(audio);
  });
});

describe('Audio - Snapshots', () => {
  it('matches snapshot with required props', () => {
    const { container } = render(<Audio src="/audio.mp3" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<Audio src="/audio.mp3" className="rounded-lg shadow-lg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with MP3 audio', () => {
    const { container } = render(<Audio src="/song.mp3" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with WAV audio', () => {
    const { container } = render(<Audio src="/sound.wav" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with OGG audio', () => {
    const { container } = render(<Audio src="/track.ogg" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with controls disabled', () => {
    const { container } = render(<Audio src="/audio.mp3" controls={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with autoPlay and muted', () => {
    const { container } = render(<Audio src="/audio.mp3" autoPlay muted />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with loop', () => {
    const { container } = render(<Audio src="/audio.mp3" loop />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with preload attribute', () => {
    const { container } = render(<Audio src="/audio.mp3" preload="none" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with id prop', () => {
    const { container } = render(<Audio src="/audio.mp3" id="hero-audio" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with data-testid prop', () => {
    const { container } = render(<Audio src="/audio.mp3" data-testid="custom-test-id" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple custom attributes', () => {
    const { container } = render(
      <Audio src="/complex.mp3" className="rounded-xl border-2" autoPlay muted loop preload="auto" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
