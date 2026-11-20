'use client';

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Camera, ImagePlus } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';

async function decodeFrame(canvas: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number) {
  if (!width || !height) return null;
  const scale = Math.min(1, 1280 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { default: decode } = await import('jsqr');
  return decode(frame.data, frame.width, frame.height)?.data.trim() || null;
}

/** Camera and image decoding run on this device, including on browsers without BarcodeDetector. */
export function WalletScanner({ onRead }: { onRead: (text: string) => void }) {
  const [camera, setCamera] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const found = useEffectEvent((text: string) => {
    setCamera(false);
    setError('');
    onRead(text);
  });
  useEffect(() => {
    if (!camera) return;
    const preview = video.current;
    let active = true;
    let stream: MediaStream | undefined;
    let timer = 0;
    function release() {
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (preview) preview.srcObject = null;
    }
    function unavailable() {
      if (!active) return;
      setCamera(false);
      setError('Camera unavailable. Choose a QR image or paste the payment request.');
    }
    async function start() {
      if (!preview || !navigator.mediaDevices?.getUserMedia) {
        unavailable();
        return;
      }
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!active) {
        release();
        return;
      }
      preview.srcObject = stream;
      await preview.play();
      const canvas = document.createElement('canvas');
      async function scan() {
        if (!active || !preview) return;
        try {
          const text =
            preview.readyState >= 2
              ? await decodeFrame(canvas, preview, preview.videoWidth, preview.videoHeight)
              : null;
          if (!active) return;
          if (text) {
            found(text);
            return;
          }
          timer = window.setTimeout(() => void scan(), 150);
        } catch {
          unavailable();
        }
      }
      await scan();
    }
    function stopWhenHidden() {
      if (document.hidden) setCamera(false);
    }
    document.addEventListener('visibilitychange', stopWhenHidden);
    void start().catch(unavailable);
    return () => {
      active = false;
      release();
      document.removeEventListener('visibilitychange', stopWhenHidden);
    };
  }, [camera]);

  async function readFile(imageFile: File) {
    setCamera(false);
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageFile.type) || imageFile.size > 16 * 1024 * 1024) {
      setError('Choose a PNG, JPEG, or WebP image under 16 MB.');
      return;
    }
    setReading(true);
    let url: string | undefined;
    try {
      url = URL.createObjectURL(imageFile);
      const image = new Image();
      image.src = url;
      await image.decode();
      const text = await decodeFrame(document.createElement('canvas'), image, image.naturalWidth, image.naturalHeight);
      if (!alive.current) return;
      if (text) onRead(text);
      else setError('No QR code found. Choose a clearer image or paste the payment request.');
    } catch {
      if (alive.current) setError('Could not read this image. Choose another image or paste the payment request.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (alive.current) setReading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={camera}
          disabled={reading}
          onClick={() => {
            setError('');
            setCamera(!camera);
          }}
        >
          <Camera />
          {camera ? 'Stop camera' : 'Scan QR'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={reading} onClick={() => file.current?.click()}>
          <ImagePlus />
          {reading ? 'Reading image…' : 'Choose QR image'}
        </Button>
        <input
          type="file"
          ref={file}
          aria-label="QR image file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const image = e.target.files?.[0];
            e.target.value = '';
            if (image) void readFile(image);
          }}
        />
      </div>
      {camera && (
        <video
          ref={video}
          aria-label="QR scanner camera preview"
          autoPlay
          playsInline
          muted
          className="aspect-video w-full rounded-xl bg-background object-cover"
        />
      )}
      {error && (
        <p role="status" className="text-sm text-muted-foreground">
          {error}
        </p>
      )}
    </div>
  );
}
