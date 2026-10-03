import { createRef } from 'react';
import { imagePlugin, MDXEditor, type MDXEditorMethods } from '@mdxeditor/editor';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeArticleBody } from '@/libs/post/articleInlineMedia';
import { inlineMediaPlugin } from './inlineMediaPlugin';

/**
 * The real MDXEditor with the real plugin: the import/export visitors, the drop and paste
 * handlers and the in-editor renderer all run against Lexical in jsdom. The host component's
 * own tests (InitializedMDXEditor.test.tsx) mock the editor, so this file is where the
 * markdown round trip is proven.
 */

vi.mock('@/libs/file/pubkyFileCdnUrl', () => ({
  pubkyUriToCdnUrl: (uri: string) => (uri.startsWith('pubky://') ? `cdn://${uri}/main` : null),
}));

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const fileUri = (id: string) => `pubky://${AUTHOR}/pub/pubky.app/files/${id}`;
const VIDEO_URI = fileUri('clip');
const AUDIO_URI = fileUri('song');
const IMAGE_URI = fileUri('pic');

const mediaTypes: Record<string, string> = {
  [VIDEO_URI]: 'video/mp4',
  [AUDIO_URI]: 'audio/mpeg',
  [IMAGE_URI]: 'image/png',
};

type UploadMock = ReturnType<typeof vi.fn<(file: File) => Promise<string>>>;

const mountEditor = (
  markdown: string,
  options?: { getMediaType?: (uri: string) => string | null; imageUpload?: UploadMock; mediaUpload?: UploadMock },
) => {
  const ref = createRef<MDXEditorMethods>();
  const imageUpload = options?.imageUpload ?? vi.fn<(file: File) => Promise<string>>();
  const mediaUpload = options?.mediaUpload ?? vi.fn<(file: File) => Promise<string>>();
  const utils = render(
    <MDXEditor
      ref={ref}
      markdown={markdown}
      plugins={[
        imagePlugin({ imageUploadHandler: imageUpload, disableImageResize: true }),
        inlineMediaPlugin({
          uploadHandler: mediaUpload,
          getMediaType: options?.getMediaType ?? ((uri) => mediaTypes[uri] ?? null),
          getPreviewUrl: () => null,
        }),
      ]}
    />,
  );
  return { ...utils, ref, imageUpload, mediaUpload };
};

const getMarkdown = (ref: React.RefObject<MDXEditorMethods | null>) => ref.current?.getMarkdown() ?? '';

const dropFiles = (files: File[]) => {
  const root = document.querySelector('[contenteditable="true"]')!;
  fireEvent.drop(root, {
    dataTransfer: {
      files,
      items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
      types: ['Files'],
    },
  });
};

describe('inlineMediaPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a video player for an image node whose file the session knows as a video', async () => {
    mountEditor(`Intro\n\n![Clip](${VIDEO_URI})\n`);

    const node = await screen.findByTestId('inline-media-node');
    expect(node).toHaveAttribute('data-media-kind', 'video');
    const video = screen.getByTestId('inline-media-video');
    expect(video).toHaveAttribute('src', `cdn://${VIDEO_URI}/main`);
    expect(video).toHaveAttribute('aria-label', 'Clip');
  });

  it('leaves images and unknown file URIs to the image plugin', async () => {
    mountEditor(`![Pic](${IMAGE_URI})\n\n![Unknown](${fileUri('mystery')})\n`);

    await act(async () => {});
    expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-editor-block-type="image"]').length).toBeGreaterThanOrEqual(0);
  });

  it('types an external https URL by its extension', async () => {
    mountEditor('![Ext](https://example.com/clip.mp4)\n\n![Pic](https://example.com/pic.png)\n');

    const nodes = await screen.findAllByTestId('inline-media-node');
    expect(nodes).toHaveLength(1);
    expect(screen.getByTestId('inline-media-video')).toHaveAttribute('src', 'https://example.com/clip.mp4');
  });

  it('exports every media node back to image syntax, byte-identical to the input', async () => {
    const markdown = `Intro\n\n![Clip](${VIDEO_URI})\n\n![Song "quoted"](${AUDIO_URI} "A title")\n\n![Pic](${IMAGE_URI})\n`;
    const { ref } = mountEditor(markdown);
    await screen.findAllByTestId('inline-media-node');

    expect(getMarkdown(ref)).toBe(markdown.trimEnd());
  });

  it('round-trips through serializeArticleBody: every kind gets an attachment slot', async () => {
    const { ref } = mountEditor(`![Clip](${VIDEO_URI})\n\n![Song](${AUDIO_URI})\n\n![Pic](${IMAGE_URI})\n`);
    await screen.findAllByTestId('inline-media-node');

    const serialized = serializeArticleBody({
      body: getMarkdown(ref),
      coverPresent: true,
      authorPubky: AUTHOR,
      maxInlineMedia: 9,
    });

    expect(serialized.errors).toEqual([]);
    expect(serialized.inlineUris).toEqual([VIDEO_URI, AUDIO_URI, IMAGE_URI]);
    expect(serialized.body).toBe('![Clip](attachment:1)\n\n![Song](attachment:2)\n\n![Pic](attachment:3)');
  });

  it('re-imports a video node when markdown is set again (markdown mode and back)', async () => {
    const { ref } = mountEditor('Just text\n');
    await act(async () => {});
    expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();

    act(() => {
      ref.current?.setMarkdown(`![Clip](${VIDEO_URI})\n`);
    });

    expect(await screen.findByTestId('inline-media-video')).toBeInTheDocument();
    expect(getMarkdown(ref)).toBe(`![Clip](${VIDEO_URI})`);
  });

  it('takes a mixed image and video drop as one batch and inserts both in order', async () => {
    const mediaUpload = vi
      .fn<(file: File) => Promise<string>>()
      .mockImplementation((file) => Promise.resolve(file.type.startsWith('image') ? IMAGE_URI : VIDEO_URI));
    const { ref, imageUpload } = mountEditor('', { mediaUpload });
    await act(async () => {});

    const png = new File(['x'], 'pic.png', { type: 'image/png' });
    const mp4 = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    await act(async () => {
      dropFiles([png, mp4]);
    });

    await waitFor(() => {
      expect(getMarkdown(ref)).toContain(`![](${VIDEO_URI})`);
    });
    expect(getMarkdown(ref)).toContain(`![](${IMAGE_URI})`);
    expect(mediaUpload).toHaveBeenCalledTimes(2);
    expect(imageUpload).not.toHaveBeenCalled();
    expect(await screen.findByTestId('inline-media-video')).toBeInTheDocument();
  });

  it('leaves a pure-image drop to the image plugin', async () => {
    const imageUpload = vi.fn<(file: File) => Promise<string>>().mockResolvedValue(IMAGE_URI);
    const { mediaUpload } = mountEditor('', { imageUpload });
    await act(async () => {});

    await act(async () => {
      dropFiles([new File(['x'], 'pic.png', { type: 'image/png' })]);
    });

    await waitFor(() => {
      expect(imageUpload).toHaveBeenCalledTimes(1);
    });
    expect(mediaUpload).not.toHaveBeenCalled();
  });

  it('inserts a pasted audio file', async () => {
    const mediaUpload = vi.fn<(file: File) => Promise<string>>().mockResolvedValue(AUDIO_URI);
    const { ref } = mountEditor('', { mediaUpload });
    await act(async () => {});

    const mp3 = new File(['x'], 'song.mp3', { type: 'audio/mpeg' });
    await act(async () => {
      fireEvent.paste(document.querySelector('[contenteditable="true"]')!, {
        clipboardData: {
          files: [mp3],
          items: [{ kind: 'file', type: mp3.type, getAsFile: () => mp3 }],
          types: ['Files'],
        },
      });
    });

    await waitFor(() => {
      expect(getMarkdown(ref)).toBe(`![](${AUDIO_URI})`);
    });
    expect(await screen.findByTestId('inline-media-audio')).toBeInTheDocument();
  });

  it('inserts nothing when the upload is refused', async () => {
    const mediaUpload = vi.fn<(file: File) => Promise<string>>().mockRejectedValue(new Error('refused'));
    const { ref } = mountEditor('Text\n', { mediaUpload });
    await act(async () => {});

    await act(async () => {
      dropFiles([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);
    });
    await act(async () => {});

    expect(mediaUpload).toHaveBeenCalledTimes(1);
    expect(getMarkdown(ref)).toBe('Text');
  });

  it('selects a media node from its header and deletes it from the always-visible toolbar', async () => {
    const { ref } = mountEditor(`Before\n\n![Clip](${VIDEO_URI})\n\nAfter\n`);
    const node = await screen.findByTestId('inline-media-node');
    expect(screen.getByTestId('inline-media-header')).toHaveTextContent('Clip');
    expect(node.className).not.toContain('ring-2');

    await act(async () => {
      fireEvent.click(screen.getByTestId('inline-media-header'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('inline-media-node').className).toContain('ring-2');
    });

    const deleteButton = screen.getByRole('button', { name: 'Delete media' });

    await act(async () => {
      fireEvent.click(deleteButton);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();
    });
    // The paragraph that held the node stays, as it does when an image is deleted
    expect(getMarkdown(ref)).toMatch(/^Before\n+After$/);
    expect(getMarkdown(ref)).not.toContain(VIDEO_URI);
  });
});
