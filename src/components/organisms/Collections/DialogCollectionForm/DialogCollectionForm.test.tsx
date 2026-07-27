import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { COLLECTION_LAYOUT, type CollectionLayout } from '@/config/collections';
import type { UseCoverImagePickerResult } from '@/hooks/useCoverImagePicker/useCoverImagePicker';
import type { CreateCollectionFormData } from '@/hooks/useCreateCollection/useCreateCollection.types';
import { DialogCollectionForm } from './DialogCollectionForm';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

const COVER_INPUT_ID = 'test-collection-cover-image';

type Overrides = Partial<{
  title: string;
  submitLabel: string;
  layoutLabel: string;
  isSaving: boolean;
  isLoading: boolean;
  disableOpenAutoFocus: boolean;
  initialName: string;
  initialDescription: string;
  initialLayout: CollectionLayout;
  coverPreviewUrl: string | null;
  coverError: 'invalid-type' | 'too-large' | null;
  onSubmit: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  onChooseCover: () => void;
  onRemoveCover: () => void;
}>;

/**
 * Harness component: drives `DialogCollectionForm` with a real `useForm` + a
 * stub cover picker so individual tests can focus on the presentational shell
 * (title, submitLabel, isSaving, cover errors, autofocus suppression).
 */
function Harness({
  title = 'Test Title',
  submitLabel = 'Save',
  layoutLabel = 'Layout',
  isSaving = false,
  isLoading = false,
  disableOpenAutoFocus,
  initialName = '',
  initialDescription = '',
  initialLayout = COLLECTION_LAYOUT.GRID,
  coverPreviewUrl = null,
  coverError = null,
  onSubmit = () => {},
  onOpenChange,
  onChooseCover = () => {},
  onRemoveCover = () => {},
}: Overrides) {
  const [open, setOpen] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<CreateCollectionFormData>({
    defaultValues: { name: initialName, description: initialDescription, layout: initialLayout },
    mode: 'onChange',
  });
  const cover: UseCoverImagePickerResult = {
    file: null,
    previewUrl: coverPreviewUrl,
    isCleared: false,
    error: coverError,
    inputRef,
    onInputChange: () => {},
    choose: onChooseCover,
    remove: onRemoveCover,
    reset: () => {},
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <DialogCollectionForm
      open={open}
      onOpenChange={handleOpenChange}
      title={title}
      submitLabel={submitLabel}
      layoutLabel={layoutLabel}
      form={form}
      cover={cover}
      onSubmit={onSubmit}
      isSaving={isSaving}
      isLoading={isLoading}
      coverInputId={COVER_INPUT_ID}
      disableOpenAutoFocus={disableOpenAutoFocus}
    />
  );
}

describe('DialogCollectionForm', () => {
  it('renders the provided title and submit label', () => {
    render(<Harness title="Edit Collection" submitLabel="Save changes" />);

    expect(screen.getByRole('heading', { name: 'Edit Collection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('defaults to Grid and lets the creator select List', () => {
    render(<Harness layoutLabel="Default layout" />);

    const grid = screen.getByRole('radio', { name: 'collections.new.layoutGrid' });
    const list = screen.getByRole('radio', { name: 'collections.new.layoutList' });
    const layoutLabel = screen.getByText('Default layout');
    const backgroundLabel = screen.getByText('collections.new.backgroundLabel');

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(grid).toHaveAttribute('aria-checked', 'true');
    expect(list).toHaveAttribute('aria-checked', 'false');
    expect(list.querySelector('.lucide-rows-4')).toBeInTheDocument();
    expect(layoutLabel.compareDocumentPosition(backgroundLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(grid).toHaveClass('!border-x-0', '!border-t-0', '!border-b');
    expect(layoutLabel).not.toHaveClass('-mb-2');
    expect(layoutLabel.parentElement).toHaveClass('gap-2');

    fireEvent.click(list);

    expect(grid).toHaveAttribute('aria-checked', 'false');
    expect(list).toHaveAttribute('aria-checked', 'true');
  });

  it('disables the save button while the name is empty', () => {
    render(<Harness submitLabel="Save" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('enables the save button once the name has a non-whitespace value', () => {
    render(<Harness submitLabel="Save" />);

    fireEvent.change(screen.getByLabelText('collections.new.nameLabel'), { target: { value: 'Reading list' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps the save button disabled for whitespace-only names', () => {
    render(<Harness submitLabel="Save" initialName="Reading list" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('collections.new.nameLabel'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables the inputs and picker (and keeps save disabled via empty name) when isLoading is true', () => {
    render(<Harness isLoading />);

    // Inputs + cover picker are blocked from interaction while the envelope
    // hasn't propagated yet; the save button stays disabled because the name
    // hasn't been prefilled yet.
    expect(screen.getByLabelText('collections.new.nameLabel')).toBeDisabled();
    expect(screen.getByLabelText('collections.new.descriptionLabel')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'collections.new.addImage' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Cancel stays enabled so the user can back out while the load is in flight.
    expect(screen.getByRole('button', { name: 'collections.new.cancel' })).toBeEnabled();
  });

  it('keeps the save button disabled even with a non-empty name while isLoading is true', () => {
    // Defensive: a name that happens to be present mustn't unlock save while
    // the envelope is still loading (the next prefill would clobber it anyway).
    render(<Harness isLoading initialName="Reading list" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the saving label and disables all interactive controls when isSaving is true', () => {
    render(<Harness title="Edit Collection" submitLabel="Save changes" isSaving initialName="Reading list" />);

    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'collections.new.saving' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'collections.new.cancel' })).toBeDisabled();
    expect(screen.getByLabelText('collections.new.nameLabel')).toBeDisabled();
    expect(screen.getByLabelText('collections.new.descriptionLabel')).toBeDisabled();
  });

  it('invokes onSubmit when the primary button is clicked with a valid name', () => {
    const onSubmit = vi.fn();
    render(<Harness submitLabel="Save" initialName="Reading list" onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('invokes onOpenChange(false) when the cancel button is clicked', () => {
    const onOpenChange = vi.fn();
    render(<Harness onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'collections.new.cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders the cover-picker action as "Add image" when no preview URL is present', () => {
    render(<Harness coverPreviewUrl={null} />);

    expect(screen.getByRole('button', { name: 'collections.new.addImage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'collections.new.removeImage' })).not.toBeInTheDocument();
  });

  it('renders the cover-picker action as "Remove image" when a preview URL is present', () => {
    render(<Harness coverPreviewUrl="blob:preview" />);

    expect(screen.getByRole('button', { name: 'collections.new.removeImage' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'collections.new.addImage' })).not.toBeInTheDocument();
  });

  it('paints the cover preview as a background-image when previewUrl is set', () => {
    render(<Harness coverPreviewUrl="blob:preview" />);

    const previewArea = screen.getByTestId(COVER_INPUT_ID);
    expect(previewArea.getAttribute('style')).toContain('blob:preview');
  });

  it('surfaces the invalid-type cover error message', () => {
    render(<Harness coverError="invalid-type" />);

    expect(screen.getByText('collections.new.coverImageInvalid')).toBeInTheDocument();
  });

  it('surfaces the too-large cover error message', () => {
    render(<Harness coverError="too-large" />);

    expect(screen.getByText('collections.new.coverImageTooLarge')).toBeInTheDocument();
  });

  it('disables the save button while a cover error is showing, even with a valid name', () => {
    render(<Harness submitLabel="Save" initialName="Reading list" coverError="too-large" />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('wires the coverInputId to the hidden file input id and the label htmlFor', () => {
    render(<Harness />);

    const fileInput = document.getElementById(COVER_INPUT_ID) as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.tagName).toBe('INPUT');
    expect(fileInput.type).toBe('file');
    expect(screen.getByText('collections.new.backgroundLabel')).toHaveAttribute('for', COVER_INPUT_ID);
  });

  it('routes choose cover and remove cover clicks to the picker handlers', () => {
    const onChooseCover = vi.fn();
    const onRemoveCover = vi.fn();
    const { rerender } = render(<Harness onChooseCover={onChooseCover} />);

    fireEvent.click(screen.getByRole('button', { name: 'collections.new.addImage' }));
    expect(onChooseCover).toHaveBeenCalledTimes(1);

    rerender(<Harness coverPreviewUrl="blob:preview" onRemoveCover={onRemoveCover} />);

    fireEvent.click(screen.getByRole('button', { name: 'collections.new.removeImage' }));
    expect(onRemoveCover).toHaveBeenCalledTimes(1);
  });
});

describe('DialogCollectionForm - Snapshots', () => {
  it('matches snapshot in the default (no cover, idle) state', () => {
    render(<Harness title="Edit Collection" submitLabel="Save changes" />);

    expect(document.body).toMatchSnapshot();
  });

  it('matches snapshot with a cover preview present', () => {
    render(<Harness title="Edit Collection" submitLabel="Save changes" coverPreviewUrl="blob:preview" />);

    expect(document.body).toMatchSnapshot();
  });

  it('matches snapshot in the saving state', () => {
    render(<Harness title="Edit Collection" submitLabel="Save changes" isSaving initialName="Reading list" />);

    expect(document.body).toMatchSnapshot();
  });
});
