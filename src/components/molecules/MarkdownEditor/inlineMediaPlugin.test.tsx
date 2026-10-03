import { createRef } from 'react';
import { imagePlugin, MDXEditor, type MDXEditorMethods, toolbarPlugin } from '@mdxeditor/editor';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeArticleBody } from '@/libs/post/articleInlineMedia';
import { inlineMediaPlugin } from './inlineMediaPlugin';
import { InsertInlineMediaButton } from './InsertInlineMediaButton';
import { MarkdownEditorMediaDialog } from './MarkdownEditorMediaDialog';

/**
 * The real MDXEditor with the real plugin: the import/export visitors, the drop and paste
 * handlers and the in-editor renderer all run against Lexical in jsdom. The host component's
 * own tests (InitializedMDXEditor.test.tsx) mock the editor, so this file is where the
 * markdown round trip is proven.
 */

vi.mock('@/libs/file/pubkyFileCdnUrl', () => ({
  pubkyUriToCdnUrl: (uri: string) => (uri.startsWith('pubky://') ? `cdn://${uri}/main` : null),
}));
vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

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
  options?: { getMediaType?: (uri: string) => string | null; upload?: UploadMock; readOnly?: boolean },
) => {
  const ref = createRef<MDXEditorMethods>();
  // One upload handler for every kind: the plugin reads the one imagePlugin holds
  const upload = options?.upload ?? vi.fn<(file: File) => Promise<string>>();
  const utils = render(
    <MDXEditor
      ref={ref}
      markdown={markdown}
      readOnly={options?.readOnly}
      plugins={[
        toolbarPlugin({ toolbarContents: () => <InsertInlineMediaButton mediaKind="audio" /> }),
        imagePlugin({
          imageUploadHandler: upload,
          disableImageResize: true,
          ImageDialog: MarkdownEditorMediaDialog,
        }),
        inlineMediaPlugin({
          getMediaType: options?.getMediaType ?? ((uri) => mediaTypes[uri] ?? null),
          getPreviewUrl: (uri) => (uri.startsWith('pubky://') ? `cdn://${uri}/main` : null),
        }),
      ]}
    />,
  );
  return { ...utils, ref, upload };
};

const getMarkdown = (ref: React.RefObject<MDXEditorMethods | null>) => ref.current?.getMarkdown() ?? '';
const contentEditable = () => document.querySelector('[contenteditable="true"]')!;
const submitDialog = async () => {
  await act(async () => {
    fireEvent.submit(document.querySelector('form')!);
  });
};

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
    const { ref } = mountEditor(`![Pic](${IMAGE_URI})\n\n![Unknown](${fileUri('mystery')})\n`);

    await act(async () => {});
    expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();
    // Both nodes are the image plugin's decorators (jsdom never loads the image, so they stay
    // placeholders) and survive the round trip
    await waitFor(() => {
      expect(document.querySelectorAll('[data-lexical-decorator="true"]')).toHaveLength(2);
    });
    expect(getMarkdown(ref)).toBe(`![Pic](${IMAGE_URI})\n\n![Unknown](${fileUri('mystery')})`);
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
    const upload = vi
      .fn<(file: File) => Promise<string>>()
      .mockImplementation((file) => Promise.resolve(file.type.startsWith('image') ? IMAGE_URI : VIDEO_URI));
    const { ref } = mountEditor('', { upload });
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
    expect(upload).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('inline-media-video')).toBeInTheDocument();
  });

  it('leaves a pure-image drop to the image plugin', async () => {
    const upload = vi.fn<(file: File) => Promise<string>>().mockResolvedValue(IMAGE_URI);
    const { ref } = mountEditor('', { upload });
    await act(async () => {});

    await act(async () => {
      dropFiles([new File(['x'], 'pic.png', { type: 'image/png' })]);
    });

    await waitFor(() => {
      expect(upload).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(getMarkdown(ref)).toBe(`![](${IMAGE_URI})`);
    });
    expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();
  });

  it('inserts a pasted audio file', async () => {
    const upload = vi.fn<(file: File) => Promise<string>>().mockResolvedValue(AUDIO_URI);
    const { ref } = mountEditor('', { upload });
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

  it('still inserts a drop after a node was deleted from its toolbar', async () => {
    // Lexical leaves a node selection pointing at the removed node, and `$insertNodes` on such a
    // selection is a silent no-op: the upload would succeed and nothing would appear
    const NEXT_URI = fileUri('next');
    const upload = vi.fn<(file: File) => Promise<string>>().mockResolvedValue(NEXT_URI);
    const { ref } = mountEditor(`![Clip](${VIDEO_URI})\n`, {
      upload,
      getMediaType: (uri) => (uri === NEXT_URI ? 'audio/mpeg' : (mediaTypes[uri] ?? null)),
    });
    await screen.findByTestId('inline-media-node');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete media' }));
    });
    await waitFor(() => {
      expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();
    });

    await act(async () => {
      dropFiles([new File(['x'], 'song.mp3', { type: 'audio/mpeg' })]);
    });

    await waitFor(() => {
      expect(getMarkdown(ref)).toBe(`![](${NEXT_URI})`);
    });
    expect(await screen.findByTestId('inline-media-audio')).toBeInTheDocument();
  });

  it('inserts nothing when the upload is refused', async () => {
    const upload = vi.fn<(file: File) => Promise<string>>().mockRejectedValue(new Error('refused'));
    const { ref } = mountEditor('Text\n', { upload });
    await act(async () => {});

    await act(async () => {
      dropFiles([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);
    });
    await act(async () => {});

    expect(upload).toHaveBeenCalledTimes(1);
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

  it.each([
    ['Delete', 46],
    ['Backspace', 8],
  ])('removes the node with %s only while it is the selection', async (key, keyCode) => {
    const { ref } = mountEditor(`Before\n\n![Clip](${VIDEO_URI})\n\nAfter\n`);
    await screen.findByTestId('inline-media-node');

    // Nothing selected: the key leaves the node alone
    await act(async () => {
      fireEvent.keyDown(contentEditable(), { key, keyCode });
    });
    expect(screen.getByTestId('inline-media-node')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId('inline-media-header'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('inline-media-node').className).toContain('ring-2');
    });
    await act(async () => {
      fireEvent.keyDown(contentEditable(), { key, keyCode });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('inline-media-node')).not.toBeInTheDocument();
    });
    expect(getMarkdown(ref)).not.toContain(VIDEO_URI);
  });

  it('leaves a click on the player to playback: the node stays unselected', async () => {
    mountEditor(`![Clip](${VIDEO_URI})\n`);
    const video = await screen.findByTestId('inline-media-video');

    await act(async () => {
      fireEvent.click(video);
    });

    expect(screen.getByTestId('inline-media-node').className).not.toContain('ring-2');
  });

  it('hides the edit and delete buttons in a read-only editor', async () => {
    mountEditor(`![Clip](${VIDEO_URI})\n`, { readOnly: true });
    await screen.findByTestId('inline-media-node');

    expect(screen.queryByTestId('inline-media-toolbar')).not.toBeInTheDocument();
  });

  it('never requests an external source before play, in the editor as in the reader', async () => {
    mountEditor(`![Ext](https://example.com/clip.mp4)\n\n![Clip](${VIDEO_URI})\n`);
    const players = await screen.findAllByTestId('inline-media-video');

    expect(players[0]).toHaveAttribute('preload', 'none');
    expect(players[1]).toHaveAttribute('preload', 'metadata');
  });

  it('claims a dragover from the item types alone, which is all a browser exposes mid-drag', async () => {
    // jsdom has no DragEvent, and Lexical's own dragover handler reads that global when a dragover
    // this plugin declines reaches it; a stand-in keeps the declined case runnable here
    vi.stubGlobal('DragEvent', class DragEvent extends Event {});
    try {
      mountEditor('Text\n');
      await act(async () => {});
      const dragOver = (type: string) =>
        fireEvent.dragOver(contentEditable(), {
          dataTransfer: { files: [], items: [{ kind: 'file', type, getAsFile: () => null }], types: ['Files'] },
        });

      // fireEvent reports false once a handler called preventDefault, which is what allows the drop
      expect(dragOver('video/mp4')).toBe(false);
      expect(dragOver('text/plain')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('edits a node description through the dialog and keeps its source', async () => {
    const { ref } = mountEditor(`![Clip](${VIDEO_URI})\n`);
    await screen.findByTestId('inline-media-node');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Edit description' }));
    });
    const altInput = await screen.findByTestId('video-dialog-alt-input');
    expect(altInput).toHaveValue('Clip');
    fireEvent.change(altInput, { target: { value: 'New clip' } });
    await submitDialog();

    await waitFor(() => {
      expect(getMarkdown(ref)).toBe(`![New clip](${VIDEO_URI})`);
    });
    expect(screen.getByTestId('inline-media-header')).toHaveTextContent('New clip');
    expect(screen.queryByTestId('video-dialog-alt-input')).not.toBeInTheDocument();
  });

  it('inserts a node from the toolbar dialog with a direct link', async () => {
    const { ref } = mountEditor('Text\n');
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByTestId('insert-inline-audio'));
    });
    const srcInput = await screen.findByTestId('audio-dialog-src-input');
    fireEvent.change(srcInput, { target: { value: 'https://example.com/song.mp3' } });
    await submitDialog();

    await waitFor(() => {
      expect(getMarkdown(ref)).toContain('![](https://example.com/song.mp3)');
    });
    expect(await screen.findByTestId('inline-media-audio')).toHaveAttribute('preload', 'none');
    expect(screen.queryByTestId('audio-dialog-src-input')).not.toBeInTheDocument();
  });
});
