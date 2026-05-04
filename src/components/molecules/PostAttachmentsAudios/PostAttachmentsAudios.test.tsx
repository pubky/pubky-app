import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PostAttachmentsAudios } from './PostAttachmentsAudios';
import type { AttachmentConstructed } from '@/organisms/PostAttachments/PostAttachments.types';

// Mock @/atoms
vi.mock('@/atoms/Audio/Audio', () => {
  return {
    Audio: ({
      src,
      className,
      onClick,
      'data-testid': dataTestId,
    }: {
      src: string;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
      'data-testid'?: string;
    }) => <audio data-testid={dataTestId || 'audio'} src={src} className={className} onClick={onClick} controls />,
  };
});

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      'data-testid': dataTestId,
    }: {
      children: React.ReactNode;
      className?: string;
      'data-testid'?: string;
    }) => (
      <div data-testid={dataTestId || 'container'} className={className}>
        {children}
      </div>
    ),
  };
});

const createMockAudio = (overrides: Partial<AttachmentConstructed> = {}): AttachmentConstructed => ({
  type: 'audio',
  name: 'test-audio.mp3',
  urls: {
    main: 'https://example.com/audio.mp3',
  },
  ...overrides,
});

describe('PostAttachmentsAudios', () => {
  describe('Basic rendering', () => {
    it('renders without crashing', () => {
      const audios = [createMockAudio()];
      render(<PostAttachmentsAudios audios={audios} />);

      expect(screen.getByTestId('container')).toBeInTheDocument();
    });

    it('renders a single audio element', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/song.mp3' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElements = screen.getAllByTestId('audio');
      expect(audioElements).toHaveLength(1);
      expect(audioElements[0]).toHaveAttribute('src', 'https://example.com/song.mp3');
    });

    it('renders multiple audio elements', () => {
      const audios = [
        createMockAudio({ urls: { main: 'https://example.com/audio1.mp3' } }),
        createMockAudio({ urls: { main: 'https://example.com/audio2.mp3' } }),
        createMockAudio({ urls: { main: 'https://example.com/audio3.mp3' } }),
      ];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElements = screen.getAllByTestId('audio');
      expect(audioElements).toHaveLength(3);
    });

    it('renders empty container when no audios provided', () => {
      render(<PostAttachmentsAudios audios={[]} />);

      const container = screen.getByTestId('container');
      expect(container).toBeInTheDocument();
      expect(container.children).toHaveLength(0);
    });

    it('applies correct src attribute to each audio element', () => {
      const audios = [
        createMockAudio({ urls: { main: 'https://example.com/first.mp3' } }),
        createMockAudio({ urls: { main: 'https://example.com/second.ogg' } }),
      ];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElements = screen.getAllByTestId('audio');
      expect(audioElements[0]).toHaveAttribute('src', 'https://example.com/first.mp3');
      expect(audioElements[1]).toHaveAttribute('src', 'https://example.com/second.ogg');
    });
  });

  describe('Container styling', () => {
    it('applies gap-3 class to container', () => {
      const audios = [createMockAudio()];
      render(<PostAttachmentsAudios audios={audios} />);

      const container = screen.getByTestId('container');
      expect(container).toHaveClass('gap-3');
    });
  });

  describe('Audio styling', () => {
    it('applies cursor-auto class to audio elements', () => {
      const audios = [createMockAudio()];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveClass('cursor-auto');
    });
  });

  describe('Click behavior', () => {
    it('stops event propagation when audio is clicked', () => {
      const parentClickHandler = vi.fn();
      const audios = [createMockAudio()];

      render(
        <div onClick={parentClickHandler}>
          <PostAttachmentsAudios audios={audios} />
        </div>,
      );

      const audioElement = screen.getByTestId('audio');
      fireEvent.click(audioElement);

      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it('stops event propagation for each audio element independently', () => {
      const parentClickHandler = vi.fn();
      const audios = [
        createMockAudio({ urls: { main: 'https://example.com/audio1.mp3' } }),
        createMockAudio({ urls: { main: 'https://example.com/audio2.mp3' } }),
      ];

      render(
        <div onClick={parentClickHandler}>
          <PostAttachmentsAudios audios={audios} />
        </div>,
      );

      const audioElements = screen.getAllByTestId('audio');

      fireEvent.click(audioElements[0]);
      expect(parentClickHandler).not.toHaveBeenCalled();

      fireEvent.click(audioElements[1]);
      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });

  describe('Audio formats', () => {
    it('renders MP3 audio correctly', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/song.mp3' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveAttribute('src', 'https://example.com/song.mp3');
    });

    it('renders OGG audio correctly', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/song.ogg' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveAttribute('src', 'https://example.com/song.ogg');
    });

    it('renders WAV audio correctly', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/song.wav' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveAttribute('src', 'https://example.com/song.wav');
    });

    it('renders WEBM audio correctly', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/song.webm' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveAttribute('src', 'https://example.com/song.webm');
    });
  });

  describe('Edge cases', () => {
    it('handles audio with special characters in URL', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/audio%20file.mp3' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveAttribute('src', 'https://example.com/audio%20file.mp3');
    });

    it('handles audio with query parameters in URL', () => {
      const audios = [createMockAudio({ urls: { main: 'https://example.com/audio.mp3?token=abc123' } })];
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElement = screen.getByTestId('audio');
      expect(audioElement).toHaveAttribute('src', 'https://example.com/audio.mp3?token=abc123');
    });

    it('handles large number of audio elements', () => {
      const audios = Array.from({ length: 10 }, (_, i) =>
        createMockAudio({ urls: { main: `https://example.com/audio${i}.mp3` } }),
      );
      render(<PostAttachmentsAudios audios={audios} />);

      const audioElements = screen.getAllByTestId('audio');
      expect(audioElements).toHaveLength(10);
    });
  });
});

describe('PostAttachmentsAudios - Snapshots', () => {
  it('matches snapshot with single audio', () => {
    const audios = [createMockAudio({ urls: { main: 'https://example.com/audio.mp3' } })];
    const { container } = render(<PostAttachmentsAudios audios={audios} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple audios', () => {
    const audios = [
      createMockAudio({ urls: { main: 'https://example.com/audio1.mp3' } }),
      createMockAudio({ urls: { main: 'https://example.com/audio2.mp3' } }),
      createMockAudio({ urls: { main: 'https://example.com/audio3.mp3' } }),
    ];
    const { container } = render(<PostAttachmentsAudios audios={audios} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty audios array', () => {
    const { container } = render(<PostAttachmentsAudios audios={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with different audio formats', () => {
    const audios = [
      createMockAudio({ urls: { main: 'https://example.com/song.mp3' } }),
      createMockAudio({ urls: { main: 'https://example.com/track.ogg' } }),
      createMockAudio({ urls: { main: 'https://example.com/sound.wav' } }),
    ];
    const { container } = render(<PostAttachmentsAudios audios={audios} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
