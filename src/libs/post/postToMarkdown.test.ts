import { describe, expect, it, vi } from 'vitest';

vi.mock('@/services/nexus/file/file.api', () => ({
  filesApi: {
    getFileUrl: ({ pubky, file_id, variant }: { pubky: string; file_id: string; variant: string }) =>
      `https://cdn.test/files/${pubky}/${file_id}/${variant}`,
  },
}));

const { postToMarkdown } = await import('./postToMarkdown');

const IMAGE_URI = 'pubky://userpk/pub/pubky.app/files/img1';
const VIDEO_URI = 'pubky://userpk/pub/pubky.app/files/vid1';
const FILE_URI = 'pubky://userpk/pub/pubky.app/files/doc1';

describe('postToMarkdown', () => {
  it('returns null for a deleted post regardless of kind', () => {
    expect(postToMarkdown({ kind: 'short', content: '[DELETED]' })).toBeNull();
    expect(postToMarkdown({ kind: 'long', content: '[DELETED]' })).toBeNull();
    expect(postToMarkdown({ kind: 'collection', content: '[DELETED]' })).toBeNull();
    expect(postToMarkdown({ kind: 'image', content: '[DELETED]', attachments: [IMAGE_URI] })).toBeNull();
  });

  it('returns stored content for short, reply, link, and media kinds', () => {
    expect(postToMarkdown({ kind: 'short', content: 'hello **world**' })).toBe('hello **world**');
    expect(postToMarkdown({ kind: 'reply', content: 'a reply' })).toBe('a reply');
    expect(postToMarkdown({ kind: 'link', content: 'https://x.test' })).toBe('https://x.test');
    expect(postToMarkdown({ kind: 'image', content: 'caption' })).toBe('caption');
    expect(postToMarkdown({ kind: 'video', content: '' })).toBe('');
    expect(postToMarkdown({ kind: 'file', content: '' })).toBe('');
  });

  it('unwraps a long article to a heading plus body', () => {
    const content = JSON.stringify({ title: 'My Article', body: 'The body *here*.' });
    expect(postToMarkdown({ kind: 'long', content })).toBe('# My Article\n\nThe body *here*.');
  });

  it('falls back to raw content for an unparseable long post', () => {
    expect(postToMarkdown({ kind: 'long', content: 'plain text' })).toBe('plain text');
  });

  it('renders a collection as a heading and description, omitting items', () => {
    const content = JSON.stringify({
      name: 'Based Bitcoin',
      description: 'A bit of Bitcoin purity.',
      items: ['pubky://author/pub/pubky.app/posts/abc'],
    });
    expect(postToMarkdown({ kind: 'collection', content })).toBe('# Based Bitcoin\n\nA bit of Bitcoin purity.');
  });

  it('renders a collection with only a name as a heading', () => {
    const content = JSON.stringify({ name: 'Empty collection' });
    expect(postToMarkdown({ kind: 'collection', content })).toBe('# Empty collection');
  });

  it('falls back to raw content for an unparseable collection', () => {
    expect(postToMarkdown({ kind: 'collection', content: 'not json' })).toBe('not json');
  });

  it('appends image attachments as markdown images after the caption', () => {
    expect(postToMarkdown({ kind: 'image', content: 'sunset', attachments: [IMAGE_URI] })).toBe(
      'sunset\n\n![](https://cdn.test/files/userpk/img1/main)',
    );
  });

  it('emits only the image embed for an image-only post', () => {
    expect(postToMarkdown({ kind: 'image', content: '', attachments: [IMAGE_URI] })).toBe(
      '![](https://cdn.test/files/userpk/img1/main)',
    );
  });

  it('appends each image attachment on its own block', () => {
    const second = 'pubky://userpk/pub/pubky.app/files/img2';
    expect(postToMarkdown({ kind: 'image', content: '', attachments: [IMAGE_URI, second] })).toBe(
      '![](https://cdn.test/files/userpk/img1/main)\n\n![](https://cdn.test/files/userpk/img2/main)',
    );
  });

  it('appends video attachments as markdown links', () => {
    expect(postToMarkdown({ kind: 'video', content: 'clip', attachments: [VIDEO_URI] })).toBe(
      'clip\n\n[video](https://cdn.test/files/userpk/vid1/main)',
    );
  });

  it('appends file attachments as markdown links', () => {
    expect(postToMarkdown({ kind: 'file', content: '', attachments: [FILE_URI] })).toBe(
      '[file](https://cdn.test/files/userpk/doc1/main)',
    );
  });

  it('skips malformed attachment URIs', () => {
    expect(
      postToMarkdown({
        kind: 'image',
        content: 'ok',
        attachments: ['https://evil.example/x.png', IMAGE_URI, 'not-a-uri'],
      }),
    ).toBe('ok\n\n![](https://cdn.test/files/userpk/img1/main)');
  });

  it('appends article attachments after the unwrapped body', () => {
    const content = JSON.stringify({ title: 'Title', body: 'Body' });
    expect(postToMarkdown({ kind: 'long', content, attachments: [IMAGE_URI] })).toBe(
      '# Title\n\nBody\n\n![](https://cdn.test/files/userpk/img1/main)',
    );
  });

  it('renders a quote comment above the original as a blockquote', () => {
    expect(
      postToMarkdown({
        kind: 'short',
        content: 'my take',
        quoted: {
          kind: 'short',
          content: 'original line\nstill original',
          href: '/post/author/0035ORIGINAL.md',
        },
      }),
    ).toBe('my take\n\n> original line\n> still original\n>\n> — /post/author/0035ORIGINAL.md');
  });

  it('renders a bare repost as only the original blockquote', () => {
    expect(
      postToMarkdown({
        kind: 'short',
        content: '',
        quoted: { kind: 'short', content: 'just the original', href: '/post/a/b.md' },
      }),
    ).toBe('> just the original\n>\n> — /post/a/b.md');
  });

  it('includes quoted attachments inside the blockquote', () => {
    expect(
      postToMarkdown({
        kind: 'short',
        content: 'nice pic',
        quoted: {
          kind: 'image',
          content: 'sunset',
          attachments: [IMAGE_URI],
          href: '/post/a/b.md',
        },
      }),
    ).toBe('nice pic\n\n> sunset\n>\n> ![](https://cdn.test/files/userpk/img1/main)\n>\n> — /post/a/b.md');
  });

  it('omits a deleted quoted original', () => {
    expect(
      postToMarkdown({
        kind: 'short',
        content: 'still here',
        quoted: { kind: 'short', content: '[DELETED]', href: '/post/a/b.md' },
      }),
    ).toBe('still here');
  });

  it('prefixes a reply with a link to the parent .md', () => {
    expect(postToMarkdown({ kind: 'short', content: 'agreed', replyHref: '/post/a/b.md' })).toBe(
      'In reply to: /post/a/b.md\n\nagreed',
    );
  });
});
