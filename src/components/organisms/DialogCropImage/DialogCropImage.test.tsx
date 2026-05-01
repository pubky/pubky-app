import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Area } from 'react-easy-crop';
import { DialogCropImage } from './DialogCropImage';
vi.mock('@/atoms/Dialog/Dialog', () => {
  return {
    Dialog: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog">{children}</div>,
    DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-content" className={className}>
        {children}
      </div>
    ),
    DialogHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-header" className={className}>
        {children}
      </div>
    ),
    DialogTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <h2 data-testid="dialog-title" className={className}>
        {children}
      </h2>
    ),
    DialogDescription: ({ children }: { children: React.ReactNode }) => (
      <p data-testid="dialog-description">{children}</p>
    ),
    DialogFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="dialog-footer" className={className}>
        {children}
      </div>
    ),
  };
});

const mockCroppedPixels: Area = { width: 120, height: 120, x: 10, y: 15 };

vi.mock('react-easy-crop/react-easy-crop.css', () => ({}));

let latestCropComplete: ((area: Area, croppedAreaPixels: Area) => void) | null = null;

vi.mock('react-easy-crop', () => ({
  __esModule: true,
  default: ({ onCropComplete }: { onCropComplete: (area: Area, croppedAreaPixels: Area) => void }) => {
    latestCropComplete = onCropComplete;
    return <div data-testid="cropper" />;
  },
}));

const triggerCropComplete = () => {
  if (latestCropComplete) {
    act(() => {
      latestCropComplete?.(mockCroppedPixels, mockCroppedPixels);
    });
  }
};

const mockCropImageToBlob = vi.fn();

vi.mock('@/libs/image/cropImage', () => ({
  cropImageToBlob: (...args: unknown[]) => mockCropImageToBlob(...args),
}));

vi.mock('@/atoms/Button/Button', () => {
  return {
    Button: ({
      children,
      onClick,
      disabled,
      className,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      className?: string;
    }) => (
      <button type="button" data-testid="button" onClick={onClick} disabled={disabled} className={className}>
        {children}
      </button>
    ),
  };
});

if (!('createObjectURL' in URL)) {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

const createDefaultProps = () => ({
  open: true,
  imageSrc: 'data:image/png;base64,example',
  fileName: 'avatar.png',
  fileType: 'image/png',
  onClose: vi.fn(),
  onBack: vi.fn(),
  onCrop: vi.fn(),
});

afterEach(() => {
  latestCropComplete = null;
  vi.clearAllMocks();
});

describe('DialogCropImage', () => {
  it('matches snapshot with image loaded', async () => {
    const props = createDefaultProps();
    const { container } = render(<DialogCropImage {...props} />);

    triggerCropComplete();

    await waitFor(() => {
      const doneButton = screen.getByRole('button', { name: 'Done' });
      expect(doneButton).not.toBeDisabled();
    });

    expect(container.firstChild).toMatchSnapshot();
  });

  it('invokes crop callback when Done is clicked', async () => {
    const props = createDefaultProps();
    const blob = new Blob(['test'], { type: 'image/jpeg' });
    mockCropImageToBlob.mockResolvedValueOnce(blob);
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-url');

    render(<DialogCropImage {...props} />);

    triggerCropComplete();

    const doneButton = await screen.findByRole('button', { name: 'Done' });

    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(mockCropImageToBlob).toHaveBeenCalledWith(props.imageSrc, mockCroppedPixels, props.fileType);
      expect(props.onCrop).toHaveBeenCalled();
    });

    const [fileArg, previewArg] = props.onCrop.mock.calls[0];
    expect(fileArg).toBeInstanceOf(File);
    expect(fileArg.type).toBe('image/jpeg');
    expect(fileArg.name).toBe(props.fileName);
    expect(previewArg).toBe('blob:preview-url');

    createObjectURLSpy.mockRestore();
  });

  it('triggers onBack when back button is pressed', async () => {
    const props = createDefaultProps();
    render(<DialogCropImage {...props} />);

    triggerCropComplete();

    const backButton = await screen.findByRole('button', { name: '← Back' });
    fireEvent.click(backButton);

    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('triggers onClose when cancel button is pressed', async () => {
    const props = createDefaultProps();
    render(<DialogCropImage {...props} />);

    triggerCropComplete();

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
