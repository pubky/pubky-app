/**
 * Share utility with Web Share API support and fallback functionality
 *
 * This utility provides a consistent interface for sharing content across the application,
 * with automatic fallback to clipboard when the Web Share API is not available.
 */

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareResult {
  success: boolean;
  method: 'native' | 'fallback';
  cancelled?: boolean;
}

export interface ShareOptions {
  onFallback?: () => Promise<void>;
  onSuccess?: (result: ShareResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Share content using the Web Share API with fallback support
 *
 * @param data - The data to share (title, text, url)
 * @param options - Configuration options for fallback and callbacks
 * @returns Promise<ShareResult> - Result of the share operation
 *
 * @example
 * ```typescript
 * const result = await shareWithFallback(
 *   {
 *     title: 'My Pubky',
 *     text: 'Here is my Pubky:\npubky1234567890abcdef',
 *   },
 *   {
 *     onFallback: () => copyToClipboard('pubky1234567890abcdef'),
 *     onSuccess: (result) => {
 *       if (result.method === 'fallback') {
 *         toast({ title: 'Copied to clipboard' });
 *       }
 *     },
 *     onError: (error) => {
 *       toast({ variant: 'error', title: 'Share failed', description: error.message });
 *     }
 *   }
 * );
 * ```
 */
export const shareWithFallback = async (data: ShareData, options: ShareOptions = {}): Promise<ShareResult> => {
  const { onFallback, onSuccess, onError } = options;

  try {
    // Check if Web Share API is available
    if (navigator.share) {
      await navigator.share(data);
      const result: ShareResult = { success: true, method: 'native' };
      onSuccess?.(result);
      return result;
    }

    // Fallback to clipboard or custom fallback function
    if (onFallback) {
      await onFallback();
      const result: ShareResult = { success: true, method: 'fallback' };
      onSuccess?.(result);
      return result;
    }

    // If no fallback provided and Web Share API not available, throw error
    throw new Error('Web Share API not available and no fallback provided');
  } catch (err) {
    const error = err as Error & { name?: string };

    // Handle user cancellation (don't treat as error)
    if (error.name === 'AbortError') {
      const result: ShareResult = { success: false, method: 'native', cancelled: true };
      onSuccess?.(result);
      return result;
    }

    // Handle other errors
    onError?.(error);
    throw error;
  }
};
