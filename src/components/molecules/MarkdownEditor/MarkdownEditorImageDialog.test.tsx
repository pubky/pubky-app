import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownEditorImageDialog } from './MarkdownEditorImageDialog';

type DialogState =
  | { type: 'inactive' }
  | { type: 'new' }
  | { type: 'editing'; nodeKey: string; initialValues: { src?: string; altText?: string; title?: string } };

const { mockRealm } = vi.hoisted(() => ({
  mockRealm: {
    state: { type: 'inactive' } as DialogState,
    uploadHandler: null as ((file: File) => Promise<string>) | null,
    saveImage: vi.fn(),
    closeImageDialog: vi.fn(),
  },
}));

vi.mock('@mdxeditor/editor', () => ({
  imageDialogState$: 'imageDialogState$',
  imageUploadHandler$: 'imageUploadHandler$',
  saveImage$: 'saveImage$',
  closeImageDialog$: 'closeImageDialog$',
}));

vi.mock('@mdxeditor/gurx', () => ({
  useCellValues: vi.fn(() => [mockRealm.state, mockRealm.uploadHandler]),
  usePublisher: vi.fn((cell: string) => (cell === 'saveImage$' ? mockRealm.saveImage : mockRealm.closeImageDialog)),
}));

const submitForm = () => {
  const form = document.querySelector('form');
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
};

global.URL.createObjectURL = vi.fn(() => 'blob:mock-preview');
global.URL.revokeObjectURL = vi.fn();

describe('MarkdownEditorImageDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRealm.state = { type: 'new' };
    mockRealm.uploadHandler = vi.fn();
  });

  it('renders nothing while inactive', () => {
    mockRealm.state = { type: 'inactive' };
    const { container } = render(<MarkdownEditorImageDialog />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Add image')).not.toBeInTheDocument();
  });

  it('renders the add-image form with a disabled save button until a source exists', () => {
    render(<MarkdownEditorImageDialog />);

    // Both the visible DialogTitle and the sr-only hiddenTitle carry the text
    expect(screen.getAllByText('Add image').length).toBeGreaterThan(0);
    expect(screen.getByTestId('image-dialog-file-input')).toBeInTheDocument();
    expect(screen.getByText('Or add an image from a URL')).toBeInTheDocument();
    expect(screen.getByTestId('image-dialog-save-button')).toBeDisabled();
  });

  it('hides the file field when no upload handler is registered', () => {
    mockRealm.uploadHandler = null;
    render(<MarkdownEditorImageDialog />);

    expect(screen.queryByTestId('image-dialog-file-input')).not.toBeInTheDocument();
    expect(screen.getByText('Add an image from a URL')).toBeInTheDocument();
  });

  it('saves a URL image without uploading', () => {
    render(<MarkdownEditorImageDialog />);

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
    render(<MarkdownEditorImageDialog />);

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
    render(<MarkdownEditorImageDialog />);

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
    render(<MarkdownEditorImageDialog />);

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
    render(<MarkdownEditorImageDialog />);

    fireEvent.click(screen.getByTestId('image-dialog-cancel-button'));

    expect(mockRealm.closeImageDialog).toHaveBeenCalled();
  });

  it('prefills when editing and passes the existing title through unchanged', () => {
    mockRealm.state = {
      type: 'editing',
      nodeKey: 'node-1',
      initialValues: { src: 'https://example.com/old.png', altText: 'Old alt', title: 'Keep me' },
    };
    render(<MarkdownEditorImageDialog />);

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
