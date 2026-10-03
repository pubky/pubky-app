import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { MarkdownEditorMediaDialog } from './MarkdownEditorMediaDialog';

type DialogState =
  | { type: 'inactive' }
  | { type: 'new' }
  | { type: 'editing'; nodeKey: string; initialValues: { src?: string; altText?: string; title?: string } };

type MediaKind = 'video' | 'audio' | 'pdf';
type MediaDialogState =
  | { type: 'inactive' }
  | { type: 'new'; mediaKind: MediaKind }
  | {
      type: 'editing';
      mediaKind: MediaKind;
      nodeKey: string;
      initialValues: { src: string; altText: string; title?: string };
    };

const { mockRealm } = vi.hoisted(() => ({
  mockRealm: {
    state: { type: 'inactive' } as DialogState,
    uploadHandler: null as ((file: File) => Promise<string>) | null,
    saveImage: vi.fn(),
    closeImageDialog: vi.fn(),
    mediaState: { type: 'inactive' } as MediaDialogState,
    mediaUploadHandler: null as ((file: File) => Promise<string>) | null,
    resolveType: (_uri: string): string | null => null,
    saveMedia: vi.fn(),
    closeMediaDialog: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

vi.mock('./inlineMediaPlugin', () => ({
  inlineMediaDialogState$: 'inlineMediaDialogState$',
  inlineMediaUploadHandler$: 'inlineMediaUploadHandler$',
  inlineMediaTypeResolver$: 'inlineMediaTypeResolver$',
  saveInlineMedia$: 'saveInlineMedia$',
  closeInlineMediaDialog$: 'closeInlineMediaDialog$',
}));

vi.mock('@mdxeditor/editor', () => ({
  imageDialogState$: 'imageDialogState$',
  imageUploadHandler$: 'imageUploadHandler$',
  saveImage$: 'saveImage$',
  closeImageDialog$: 'closeImageDialog$',
}));

const publishers: Record<string, () => unknown> = {
  saveImage$: () => mockRealm.saveImage,
  closeImageDialog$: () => mockRealm.closeImageDialog,
  saveInlineMedia$: () => mockRealm.saveMedia,
  closeInlineMediaDialog$: () => mockRealm.closeMediaDialog,
};

vi.mock('@mdxeditor/gurx', () => ({
  useCellValues: vi.fn(() => [
    mockRealm.state,
    mockRealm.uploadHandler,
    mockRealm.mediaState,
    mockRealm.mediaUploadHandler,
    mockRealm.resolveType,
  ]),
  usePublisher: vi.fn((cell: string) => publishers[cell]()),
}));

const submitForm = () => {
  const form = document.querySelector('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
};

global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
global.URL.revokeObjectURL = vi.fn();

describe('MarkdownEditorMediaDialog — images (MDXEditor dialog cells)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRealm.state = { type: 'new' };
    mockRealm.uploadHandler = vi.fn();
    mockRealm.mediaState = { type: 'inactive' };
    mockRealm.mediaUploadHandler = null;
  });

  it('renders nothing while inactive', () => {
    mockRealm.state = { type: 'inactive' };
    const { container } = render(<MarkdownEditorMediaDialog />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Add image')).not.toBeInTheDocument();
  });

  it('renders the add-image form with a disabled save button until a source exists', () => {
    render(<MarkdownEditorMediaDialog />);

    // Both the visible DialogTitle and the sr-only hiddenTitle carry the text
    expect(screen.getAllByText('Add image').length).toBeGreaterThan(0);
    expect(screen.getByTestId('image-dialog-file-input')).toBeInTheDocument();
    expect(screen.getByText('Or add an image from a URL')).toBeInTheDocument();
    expect(screen.getByTestId('image-dialog-save-button')).toBeDisabled();
  });

  it('hides the file field when no upload handler is registered', () => {
    mockRealm.uploadHandler = null;
    render(<MarkdownEditorMediaDialog />);

    expect(screen.queryByTestId('image-dialog-file-input')).not.toBeInTheDocument();
    expect(screen.getByText('Add an image from a URL')).toBeInTheDocument();
  });

  it('saves a URL image without uploading', () => {
    render(<MarkdownEditorMediaDialog />);

    fireEvent.change(screen.getByTestId('image-dialog-src-input'), { target: { value: 'https://example.com/a.png' } });
    fireEvent.change(screen.getByTestId('image-dialog-alt-input'), { target: { value: 'My alt' } });
    submitForm();

    expect(mockRealm.uploadHandler).not.toHaveBeenCalled();
    expect(mockRealm.saveImage).toHaveBeenCalledWith({
      src: 'https://example.com/a.png',
      altText: 'My alt',
      title: undefined,
    });
  });

  it('uploads a chosen file with a loading state before saving', async () => {
    let resolveUpload!: (uri: string) => void;
    mockRealm.uploadHandler = vi.fn(() => new Promise<string>((resolve) => (resolveUpload = resolve)));
    render(<MarkdownEditorMediaDialog />);

    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    fireEvent.change(screen.getByTestId('image-dialog-file-input'), { target: { files: [file] } });
    fireEvent.change(screen.getByTestId('image-dialog-alt-input'), { target: { value: 'Alt' } });
    submitForm();

    // Loading state: spinner, disabled controls, no premature save
    await waitFor(() => {
      expect(screen.getByTestId('image-dialog-save-button')).toBeDisabled();
    });
    expect(screen.getByTestId('image-dialog-save-button')).toHaveTextContent('Uploading…');
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.getByTestId('image-dialog-cancel-button')).toBeDisabled();
    expect(screen.getByTestId('image-dialog-src-input')).toBeDisabled();
    expect(mockRealm.saveImage).not.toHaveBeenCalled();

    resolveUpload('pubky://author/pub/pubky.app/files/img1');

    await waitFor(() => {
      expect(mockRealm.saveImage).toHaveBeenCalledWith({
        src: 'pubky://author/pub/pubky.app/files/img1',
        altText: 'Alt',
        title: undefined,
      });
    });
    expect(mockRealm.uploadHandler).toHaveBeenCalledWith(file);
  });

  it('stays open and re-enables the form when the upload fails', async () => {
    mockRealm.uploadHandler = vi.fn(() => Promise.reject(new Error('rejected')));
    render(<MarkdownEditorMediaDialog />);

    fireEvent.change(screen.getByTestId('image-dialog-file-input'), {
      target: { files: [new File(['x'], 'pic.png', { type: 'image/png' })] },
    });
    submitForm();

    await waitFor(() => {
      expect(screen.getByTestId('image-dialog-save-button')).toHaveTextContent('Save');
    });
    expect(mockRealm.saveImage).not.toHaveBeenCalled();
    expect(mockRealm.closeImageDialog).not.toHaveBeenCalled();
    expect(screen.getByTestId('image-dialog-save-button')).toBeEnabled();
  });

  it('shows a preview with a remove button once a file is chosen', () => {
    render(<MarkdownEditorMediaDialog />);

    expect(screen.getByTestId('image-dialog-file-choose-button')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('image-dialog-file-input'), {
      target: { files: [new File(['x'], 'pic.png', { type: 'image/png' })] },
    });

    expect(screen.getByTestId('image-dialog-file-preview')).toHaveStyle({
      backgroundImage: 'url(blob:mock-preview)',
    });
    expect(screen.getByTestId('image-dialog-save-button')).toBeEnabled();

    fireEvent.click(screen.getByTestId('image-dialog-file-remove-button'));

    expect(screen.getByTestId('image-dialog-file-choose-button')).toBeInTheDocument();
    expect(screen.getByTestId('image-dialog-save-button')).toBeDisabled();
  });

  it('closes via the cancel button', () => {
    render(<MarkdownEditorMediaDialog />);

    fireEvent.click(screen.getByTestId('image-dialog-cancel-button'));

    expect(mockRealm.closeImageDialog).toHaveBeenCalled();
  });

  it('prefills when editing and passes the existing title through unchanged', () => {
    mockRealm.state = {
      type: 'editing',
      nodeKey: 'node-1',
      initialValues: { src: 'https://example.com/old.png', altText: 'Old alt', title: 'Keep me' },
    };
    render(<MarkdownEditorMediaDialog />);

    expect(screen.getAllByText('Edit image').length).toBeGreaterThan(0);
    expect(screen.getByTestId('image-dialog-src-input')).toHaveValue('https://example.com/old.png');
    expect(screen.getByTestId('image-dialog-alt-input')).toHaveValue('Old alt');

    fireEvent.change(screen.getByTestId('image-dialog-alt-input'), { target: { value: 'New alt' } });
    submitForm();

    expect(mockRealm.saveImage).toHaveBeenCalledWith({
      src: 'https://example.com/old.png',
      altText: 'New alt',
      title: 'Keep me',
    });
  });
});

describe('MarkdownEditorMediaDialog — video, audio and PDF', () => {
  const VIDEO_URI = 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/files/clip1';

  beforeEach(() => {
    vi.clearAllMocks();
    mockRealm.state = { type: 'inactive' };
    mockRealm.uploadHandler = null;
    mockRealm.mediaState = { type: 'new', mediaKind: 'video' };
    mockRealm.mediaUploadHandler = vi.fn();
    mockRealm.resolveType = () => null;
  });

  it.each([
    ['video', 'Add video', 'video/mp4,video/mpeg'],
    ['audio', 'Add audio', 'audio/mpeg,audio/wav'],
    ['pdf', 'Add PDF', 'application/pdf'],
  ] as const)('opens the %s form with its own copy and accept filter', (mediaKind, title, accept) => {
    mockRealm.mediaState = { type: 'new', mediaKind };
    render(<MarkdownEditorMediaDialog />);

    expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    expect(screen.getByTestId(`${mediaKind}-dialog-file-input`)).toHaveAttribute('accept', accept);
    expect(screen.queryByTestId('image-dialog-file-input')).not.toBeInTheDocument();
    expect(screen.getByTestId(`${mediaKind}-dialog-save-button`)).toBeDisabled();
  });

  it('shows the chosen file by name (no image preview) and uploads it before saving with its kind', async () => {
    const upload = vi.fn().mockResolvedValue(VIDEO_URI);
    mockRealm.mediaUploadHandler = upload;
    render(<MarkdownEditorMediaDialog />);

    const clip = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    fireEvent.change(screen.getByTestId('video-dialog-file-input'), { target: { files: [clip] } });
    expect(screen.getByTestId('video-dialog-file-name')).toHaveTextContent('clip.mp4');
    expect(screen.getByTestId('video-dialog-file-preview')).not.toHaveStyle({
      backgroundImage: 'url(blob:mock-preview)',
    });

    fireEvent.change(screen.getByTestId('video-dialog-alt-input'), { target: { value: 'Launch clip' } });
    submitForm();

    await waitFor(() => {
      expect(mockRealm.saveMedia).toHaveBeenCalledWith({
        src: VIDEO_URI,
        altText: 'Launch clip',
        title: undefined,
        mediaKind: 'video',
      });
    });
    expect(upload).toHaveBeenCalledWith(clip);
  });

  it('refuses a file of another kind that slipped past the picker filter', () => {
    render(<MarkdownEditorMediaDialog />);

    fireEvent.change(screen.getByTestId('video-dialog-file-input'), {
      target: { files: [new File(['x'], 'song.mp3', { type: 'audio/mpeg' })] },
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({ variant: 'error', description: 'Choose a video file.' });
    expect(screen.queryByTestId('video-dialog-file-name')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-dialog-save-button')).toBeDisabled();
  });

  it('saves a direct video URL and rejects a URL that is not a video file', () => {
    render(<MarkdownEditorMediaDialog />);

    fireEvent.change(screen.getByTestId('video-dialog-src-input'), { target: { value: 'https://example.com/page' } });
    submitForm();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Enter a direct link to a video file.',
    });
    expect(mockRealm.saveMedia).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('video-dialog-src-input'), {
      target: { value: ' https://example.com/clip.mp4 ' },
    });
    submitForm();
    expect(mockRealm.saveMedia).toHaveBeenCalledWith({
      src: 'https://example.com/clip.mp4',
      altText: '',
      title: undefined,
      mediaKind: 'video',
    });
    expect(mockRealm.saveImage).not.toHaveBeenCalled();
  });

  it('accepts a file URI the composer knows as this kind and refuses one it cannot type', () => {
    mockRealm.resolveType = (uri) => (uri === VIDEO_URI ? 'video/mp4' : null);
    render(<MarkdownEditorMediaDialog />);

    fireEvent.change(screen.getByTestId('video-dialog-src-input'), {
      target: { value: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/files/unknown' },
    });
    submitForm();
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Enter a direct link to a video file.',
    });
    expect(mockRealm.saveMedia).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('video-dialog-src-input'), { target: { value: VIDEO_URI } });
    submitForm();
    expect(mockRealm.saveMedia).toHaveBeenCalledWith({
      src: VIDEO_URI,
      altText: '',
      title: undefined,
      mediaKind: 'video',
    });
  });

  it('prefills when editing and keeps the title passthrough', () => {
    mockRealm.mediaState = {
      type: 'editing',
      mediaKind: 'audio',
      nodeKey: 'node-1',
      initialValues: { src: VIDEO_URI, altText: 'Old description', title: 'kept' },
    };
    render(<MarkdownEditorMediaDialog />);

    expect(screen.getAllByText('Edit audio').length).toBeGreaterThan(0);
    expect(screen.getByTestId('audio-dialog-alt-input')).toHaveValue('Old description');
    fireEvent.change(screen.getByTestId('audio-dialog-alt-input'), { target: { value: 'New description' } });
    submitForm();

    expect(mockRealm.saveMedia).toHaveBeenCalledWith({
      src: VIDEO_URI,
      altText: 'New description',
      title: 'kept',
      mediaKind: 'audio',
    });
  });

  it('closes through the media dialog cell, not the image one', () => {
    render(<MarkdownEditorMediaDialog />);

    fireEvent.click(screen.getByTestId('video-dialog-cancel-button'));

    expect(mockRealm.closeMediaDialog).toHaveBeenCalled();
    expect(mockRealm.closeImageDialog).not.toHaveBeenCalled();
  });
});
