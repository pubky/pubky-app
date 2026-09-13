import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';

interface UseShareUrlOptions {
  /** Title handed to the native share sheet alongside the URL. */
  title?: string;
  successTitle?: string;
  errorDescription?: string;
}

/**
 * Hands a URL over to the platform.
 *
 * Prefers the native share sheet when the browser exposes one: an installed PWA
 * has no address bar, so the sheet is the only way to move a link straight into
 * another app. Everywhere else, and whenever a share attempt fails for a reason
 * other than the user dismissing the sheet, it falls back to the clipboard.
 */
export function useShareUrl(options: UseShareUrlOptions = {}) {
  const {
    title,
    successTitle = 'Link copied to clipboard',
    errorDescription = 'Could not copy to clipboard',
  } = options;

  const { copyToClipboard } = useCopyToClipboard({ successTitle, errorDescription });

  const shareUrl = async (url: string): Promise<boolean> => {
    if (canUseNativeShare(url)) {
      try {
        await navigator.share({ url, ...(title ? { title } : {}) });
        return true;
      } catch (error) {
        // Dismissing the sheet is a deliberate user action: stay silent instead
        // of writing to the clipboard something the user did not ask for.
        if (isAbortError(error)) return false;
      }
    }

    return copyToClipboard(url);
  };

  return { shareUrl };
}

function canUseNativeShare(url: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return true;

  try {
    return navigator.canShare({ url });
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}
