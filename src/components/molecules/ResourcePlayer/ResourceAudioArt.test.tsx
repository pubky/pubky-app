import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getImageRetryUrl, getResourceImageUrl } from '@/libs/image/resourceImage';
import { ResourceAudioArt } from './ResourceAudioArt';

const ART = getResourceImageUrl('https://podcasts.example/show', 'https://cdn.example.com/show.jpg')!;
const srcOf = () => new URL(screen.getByTestId('resource-audio-art').getAttribute('src')!, window.location.href).href;
const sameOrigin = (url: string) => new URL(url, window.location.href).href;

describe('ResourceAudioArt', () => {
  it('shows a cover from the app’s image route', () => {
    render(<ResourceAudioArt image={ART} />);
    expect(srcOf()).toBe(sameOrigin(ART));
  });

  it('never loads an address that is not the app’s image route', () => {
    render(<ResourceAudioArt image="https://cdn.example.com/show.jpg" />);
    expect(screen.queryByTestId('resource-audio-art')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-audio-art-tile')).toBeInTheDocument();
  });

  it('asks the route once more when it fails, then shows the tile', () => {
    render(<ResourceAudioArt image={ART} />);
    fireEvent.error(screen.getByTestId('resource-audio-art'));
    expect(srcOf()).toBe(sameOrigin(getImageRetryUrl(ART)));
    fireEvent.error(screen.getByTestId('resource-audio-art'));
    expect(screen.getByTestId('resource-audio-art-tile')).toBeInTheDocument();
  });
});
