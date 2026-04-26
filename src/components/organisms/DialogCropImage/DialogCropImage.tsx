'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
// NOTE: CSS import is localized here since this is currently the only component using the cropper.
// If multiple components start using react-easy-crop, consider moving this CSS import to:
// - app/globals.css (for global availability)
// - A shared client layout/provider (for centralized client-side loading)
// This prevents duplicate style inclusion and ensures consistent styling across the app.
import 'react-easy-crop/react-easy-crop.css';

import * as Atoms from '@/atoms';
import { cropImageToBlob } from '@/libs/image/cropImage';
import { Logger } from '@/libs/logger/logger';

type DialogCropImageProps = {
  open: boolean;
  imageSrc: string | null;
  fileName: string;
  fileType: string;
  onClose: () => void;
  onBack: () => void;
  onCrop: (file: File, previewUrl: string) => void;
};

const DEFAULT_FILE_NAME = 'cropped-image.png';

export function DialogCropImage({ open, imageSrc, fileName, fileType, onClose, onBack, onCrop }: DialogCropImageProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isCropping, setIsCropping] = useState(false);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setIsCropping(false);
    }
  }, [open, imageSrc]);

  const handleCropComplete = useCallback((_croppedArea: Area, croppedAreaPixelsValue: Area) => {
    setCroppedAreaPixels(croppedAreaPixelsValue);
  }, []);

  const hasImage = useMemo(() => Boolean(imageSrc), [imageSrc]);

  const handleDone = useCallback(async () => {
    if (!imageSrc || !croppedAreaPixels) return;

    try {
      setIsCropping(true);
      const targetMimeType = fileType && fileType.startsWith('image/') ? fileType : 'image/png';
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels, targetMimeType);
      const resolvedMimeType = blob.type || targetMimeType;
      const croppedFile = new File([blob], fileName || DEFAULT_FILE_NAME, { type: resolvedMimeType });
      const previewUrl = URL.createObjectURL(blob);
      onCrop(croppedFile, previewUrl);
    } catch (error) {
      Logger.error('Failed to crop image', error);
    } finally {
      setIsCropping(false);
    }
  }, [croppedAreaPixels, fileName, fileType, imageSrc, onCrop]);

  return (
    <Atoms.Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Atoms.DialogContent
        className="max-w-xl gap-6 rounded-2xl border-border bg-popover p-8 sm:p-6"
        showCloseButton={false}
        hiddenTitle="Cropped Image"
      >
        <Atoms.DialogHeader className="gap-1">
          <Atoms.DialogTitle className="text-2xl sm:text-xl">Cropped Image</Atoms.DialogTitle>
          <Atoms.DialogDescription>Adjust the selection to create the perfect square avatar.</Atoms.DialogDescription>
        </Atoms.DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl bg-black/60">
            {hasImage ? (
              <Cropper
                image={imageSrc ?? undefined}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
                restrictPosition
                objectFit="contain"
                showGrid
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                Select an image to start cropping
              </div>
            )}

            <Atoms.Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute bottom-4 left-4 rounded-full bg-black/50 px-4 text-white hover:bg-black/70"
              onClick={onBack}
            >
              ← Back
            </Atoms.Button>
          </div>

          <div className="flex items-center gap-4">
            <span id="zoom-label" className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Zoom
            </span>
            <input
              type="range"
              aria-labelledby="zoom-label"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-brand"
            />
          </div>
        </div>

        <Atoms.DialogFooter className="gap-4">
          <Atoms.Button type="button" variant="outline" size="lg" className="flex-1 rounded-full" onClick={onClose}>
            Cancel
          </Atoms.Button>
          <Atoms.Button
            type="button"
            size="lg"
            className="flex-1 rounded-full"
            onClick={handleDone}
            disabled={!hasImage || !croppedAreaPixels || isCropping}
          >
            {isCropping ? 'Processing…' : 'Done'}
          </Atoms.Button>
        </Atoms.DialogFooter>
      </Atoms.DialogContent>
    </Atoms.Dialog>
  );
}
