import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '@/config/app';
import { CHUNK_LOAD_RECOVERY_STORAGE_KEY, claimStaleChunkReload, isChunkLoadError } from './chunkLoadRecovery';

describe('isChunkLoadError', () => {
  it('matches a webpack ChunkLoadError by name', () => {
    const error = new Error('Loading chunk 42 failed.');
    error.name = 'ChunkLoadError';

    expect(isChunkLoadError(error)).toBe(true);
  });

  it('matches a named chunk error that carries no message', () => {
    const error = new Error('');
    error.name = 'ChunkLoadError';

    expect(isChunkLoadError(error)).toBe(true);
  });

  it('matches the webpack chunk message, including a non-numeric chunk id', () => {
    expect(
      isChunkLoadError(new Error('Loading chunk 42 failed.\n(webpack 5: missing: /_next/static/chunks/42.js)')),
    ).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk app/layout failed.'))).toBe(true);
  });

  it('matches a failed CSS chunk', () => {
    expect(isChunkLoadError(new Error('Loading CSS chunk 7 failed.'))).toBe(true);
  });

  it('matches a message a wrapper prefixed', () => {
    expect(isChunkLoadError(new Error('ChunkLoadError: Loading chunk 42 failed.'))).toBe(true);
  });

  it('does not match other errors', () => {
    expect(isChunkLoadError(new Error('Boom'))).toBe(false);
    expect(isChunkLoadError(new Error('Failed to load resource: 500'))).toBe(false);
    expect(isChunkLoadError('Loading chunk 42 failed.')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({ message: 42 })).toBe(false);
  });
});

describe('claimStaleChunkReload', () => {
  // jsdom's Storage is proxied, so replacing `window.sessionStorage` is the only way to make every
  // access throw the way private mode / disabled storage does.
  const originalStorage = window.sessionStorage;

  function useStorage(value: Pick<Storage, 'getItem' | 'setItem'>): void {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value });
  }

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: originalStorage });
    vi.unstubAllGlobals();
  });

  it('claims the reload once for the running build', () => {
    expect(claimStaleChunkReload()).toBe(true);
    expect(sessionStorage.getItem(CHUNK_LOAD_RECOVERY_STORAGE_KEY)).toBe(APP_VERSION);

    // Repeated failure of the same build: the terminal error UI stays instead of reloading again.
    expect(claimStaleChunkReload()).toBe(false);
  });

  it('claims a new reload when the stored build is not the running one', () => {
    sessionStorage.setItem(CHUNK_LOAD_RECOVERY_STORAGE_KEY, 'an-older-build');

    expect(claimStaleChunkReload()).toBe(true);
    expect(sessionStorage.getItem(CHUNK_LOAD_RECOVERY_STORAGE_KEY)).toBe(APP_VERSION);
  });

  it('does not claim a reload when reading the guard throws', () => {
    const setItem = vi.fn();
    useStorage({
      getItem: () => {
        throw new Error('storage disabled');
      },
      setItem,
    });

    expect(claimStaleChunkReload()).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('does not claim a reload when writing the guard throws', () => {
    useStorage({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });

    expect(claimStaleChunkReload()).toBe(false);
  });

  it('does not claim a reload during a server render', () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined });

    expect(claimStaleChunkReload()).toBe(false);

    if (windowDescriptor) {
      Object.defineProperty(globalThis, 'window', windowDescriptor);
    }
  });
});
