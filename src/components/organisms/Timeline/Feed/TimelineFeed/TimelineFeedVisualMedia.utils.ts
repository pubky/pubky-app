'use client';
import { Logger } from '@/libs/logger/logger';
import type { VisualTile, VisualTileProbeState } from './TimelineFeedVisual.types';

export type ProbeCacheEntry = {
  status: VisualTileProbeState;
  width?: number;
  height?: number;
  promise?: Promise<void>;
};

const visualTileProbeCache = new Map<string, ProbeCacheEntry>();
const visualTilePreferredSizeFallbackCache = new Map<string, NonNullable<VisualTile['preferredSize']>>();

export function resetVisualTileCaches() {
  visualTileProbeCache.clear();
  visualTilePreferredSizeFallbackCache.clear();
}

export function getVisualTileProbeCacheEntry(tileId: string) {
  return visualTileProbeCache.get(tileId);
}

export function getVisualTilePreferredSizeFallback(tileId: string) {
  return visualTilePreferredSizeFallbackCache.get(tileId);
}

export function setVisualTilePreferredSizeFallback(
  tileId: string,
  preferredSize: NonNullable<VisualTile['preferredSize']>,
) {
  visualTilePreferredSizeFallbackCache.set(tileId, preferredSize);
}

export async function probeImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new window.Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      image.src = '';
    };

    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;

      if (!width || !height) {
        cleanup();
        reject(new Error('Image metadata unavailable'));
        return;
      }

      cleanup();
      resolve({
        width,
        height,
      });
    };

    image.onerror = () => {
      cleanup();
      reject(new Error('Failed to load image metadata'));
    };
    image.src = src;
  });
}

export async function probeVideoDimensions(src: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.src = '';
      video.load();
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (!width || !height) {
        cleanup();
        reject(new Error('Video metadata unavailable'));
        return;
      }

      cleanup();
      resolve({
        width,
        height,
      });
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video metadata'));
    };
    video.src = src;
  });
}

export function ensureVisualTileProbe(tile: VisualTile): Promise<void> {
  const existing = visualTileProbeCache.get(tile.id);

  if (existing?.status === 'ready' || existing?.status === 'failed') {
    return Promise.resolve();
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const promise = (
    tile.mediaKind === 'video'
      ? probeVideoDimensions(tile.mainSrc)
      : probeImageDimensions(tile.previewSrc || tile.mainSrc)
  )
    .then(({ width, height }) => {
      visualTileProbeCache.set(tile.id, {
        status: 'ready',
        width,
        height,
      });
    })
    .catch((error) => {
      Logger.error('[VisualFeed] Failed to probe media dimensions', {
        tileId: tile.id,
        error,
      });
      visualTileProbeCache.set(tile.id, {
        status: 'failed',
      });
    });

  visualTileProbeCache.set(tile.id, {
    status: 'pending',
    promise,
  });

  return promise;
}
