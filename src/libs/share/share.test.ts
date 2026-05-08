import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareWithFallback } from './share';

// Mock navigator.share
const mockNavigatorShare = vi.fn();
const originalNavigator = global.navigator;

describe('share utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset navigator mock
    Object.defineProperty(global, 'navigator', {
      value: {
        share: mockNavigatorShare,
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore original navigator
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
    });
  });

  describe('shareWithFallback', () => {
    it('should use native sharing when Web Share API is available', async () => {
      const mockData = { title: 'Test', text: 'Test content' };
      const mockOnSuccess = vi.fn();
      const mockOnError = vi.fn();
      const mockOnFallback = vi.fn();

      mockNavigatorShare.mockResolvedValue(undefined);

      const result = await shareWithFallback(mockData, {
        onSuccess: mockOnSuccess,
        onError: mockOnError,
        onFallback: mockOnFallback,
      });

      expect(mockNavigatorShare).toHaveBeenCalledWith(mockData);
      expect(mockOnSuccess).toHaveBeenCalledWith({
        success: true,
        method: 'native',
      });
      expect(mockOnFallback).not.toHaveBeenCalled();
      expect(mockOnError).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        method: 'native',
      });
    });

    it('should use fallback when Web Share API is not available', async () => {
      // Remove navigator.share
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
      });

      const mockData = { title: 'Test', text: 'Test content' };
      const mockOnSuccess = vi.fn();
      const mockOnError = vi.fn();
      const mockOnFallback = vi.fn().mockResolvedValue(undefined);

      const result = await shareWithFallback(mockData, {
        onSuccess: mockOnSuccess,
        onError: mockOnError,
        onFallback: mockOnFallback,
      });

      expect(mockOnFallback).toHaveBeenCalled();
      expect(mockOnSuccess).toHaveBeenCalledWith({
        success: true,
        method: 'fallback',
      });
      expect(mockOnError).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        method: 'fallback',
      });
    });

    it('should handle user cancellation gracefully', async () => {
      const mockData = { title: 'Test', text: 'Test content' };
      const mockOnSuccess = vi.fn();
      const mockOnError = vi.fn();
      const mockOnFallback = vi.fn();

      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      mockNavigatorShare.mockRejectedValue(abortError);

      const result = await shareWithFallback(mockData, {
        onSuccess: mockOnSuccess,
        onError: mockOnError,
        onFallback: mockOnFallback,
      });

      expect(mockOnSuccess).toHaveBeenCalledWith({
        success: false,
        method: 'native',
        cancelled: true,
      });
      expect(mockOnError).not.toHaveBeenCalled();
      expect(mockOnFallback).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        method: 'native',
        cancelled: true,
      });
    });

    it('should handle other errors and call onError', async () => {
      const mockData = { title: 'Test', text: 'Test content' };
      const mockOnSuccess = vi.fn();
      const mockOnError = vi.fn();
      const mockOnFallback = vi.fn();

      const error = new Error('Share failed');
      mockNavigatorShare.mockRejectedValue(error);

      await expect(
        shareWithFallback(mockData, {
          onSuccess: mockOnSuccess,
          onError: mockOnError,
          onFallback: mockOnFallback,
        }),
      ).rejects.toThrow('Share failed');

      expect(mockOnError).toHaveBeenCalledWith(error);
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnFallback).not.toHaveBeenCalled();
    });

    it('should throw error when no fallback provided and Web Share API not available', async () => {
      // Remove navigator.share
      Object.defineProperty(global, 'navigator', {
        value: {},
        writable: true,
      });

      const mockData = { title: 'Test', text: 'Test content' };

      await expect(shareWithFallback(mockData)).rejects.toThrow('Web Share API not available and no fallback provided');
    });

    it('should work without callbacks', async () => {
      const mockData = { title: 'Test', text: 'Test content' };
      const mockOnFallback = vi.fn().mockResolvedValue(undefined);

      mockNavigatorShare.mockResolvedValue(undefined);

      const result = await shareWithFallback(mockData, {
        onFallback: mockOnFallback,
      });

      expect(result).toEqual({
        success: true,
        method: 'native',
      });
    });
  });
});
