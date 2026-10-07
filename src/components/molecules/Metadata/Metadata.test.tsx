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

describe('Metadata - omitImages', () => {
  it('includes static openGraph/twitter images by default', () => {
    const result = Metadata({ title: 'T', description: 'D' });
    expect(result.openGraph.images).toBeDefined();
    expect(result.twitter.images).toBeDefined();
  });

  it('omits openGraph/twitter images when omitImages is true', () => {
    const result = Metadata({ title: 'T', description: 'D', omitImages: true });
    expect(result.openGraph).not.toHaveProperty('images');
    expect(result.twitter).not.toHaveProperty('images');
    // Other fields are still present.
    expect(result.openGraph.title).toBe('T');
    expect(result.twitter.card).toBe('summary_large_image');
  });
});

describe('Metadata - twitter site', () => {
  it('defaults twitter:site to the @handle, not the site URL', () => {
    const result = Metadata({ title: 'T', description: 'D' });
    expect(result.twitter.site).toBe('@getpubky');
    expect(result.twitter.creator).toBe('@getpubky');
  });

  it('uses an explicit site prop when provided', () => {
    const result = Metadata({ title: 'T', description: 'D', site: '@custom' });
    expect(result.twitter.site).toBe('@custom');
    expect(result.twitter.creator).toBe('@getpubky');
  });
});

describe('Metadata - optional description', () => {
  it('includes description everywhere when provided', () => {
    const result = Metadata({ title: 'T', description: 'D' });
    expect(result.description).toBe('D');
    expect(result.openGraph.description).toBe('D');
    expect(result.twitter.description).toBe('D');
  });

  it('suppresses description (does not inherit parent) when absent/empty, keeping title', () => {
    const result = Metadata({ title: 'T', description: '' });
    // Top-level uses `null` (Next opt-out); og/twitter use '' — both override the
    // parent's generic description rather than inheriting it.
    expect(result.description).toBeNull();
    expect(result.openGraph.description).toBe('');
    expect(result.twitter.description).toBe('');
    // Title is still emitted so the page doesn't fall back to parent metadata.
    expect(result.title).toBe('T');
    expect(result.openGraph.title).toBe('T');
  });
});
