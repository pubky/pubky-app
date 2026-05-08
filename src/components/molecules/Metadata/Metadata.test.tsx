import { describe, expect, it } from 'vitest';
import { Metadata } from './Metadata';

describe('Metadata - Snapshots', () => {
  it('matches snapshot for default metadata configuration', () => {
    const result = Metadata({
      title: 'Test Title',
      description: 'Test Description',
    });
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot for metadata with custom parameters', () => {
    const result = Metadata({
      title: 'Custom Title',
      description: 'Custom Description',
      image: '/custom-image.jpg',
      type: 'article',
      url: 'https://custom-url.com',
      siteName: 'Custom Site',
      locale: 'it_IT',
      author: 'Custom Author',
      keywords: 'custom, keywords',
      robots: false,
    });
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot for metadata with minimal configuration', () => {
    const result = Metadata({
      title: 'Minimal',
      description: 'Minimal description',
    });
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot for metadata with image', () => {
    const result = Metadata({
      title: 'Image Test',
      description: 'Testing custom image',
      image: '/image.jpg',
    });
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with empty strings', () => {
    const result = Metadata({
      title: '',
      description: '',
    });
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with long title and description', () => {
    const longTitle = 'A'.repeat(1000);
    const longDescription = 'B'.repeat(1000);
    const result = Metadata({
      title: longTitle,
      description: longDescription,
    });
    expect(result).toMatchSnapshot();
  });

  it('matches snapshot with special characters', () => {
    const result = Metadata({
      title: 'Special chars: <>&"\'',
      description: 'More special: ©®™€£¥',
    });
    expect(result).toMatchSnapshot();
  });
});
