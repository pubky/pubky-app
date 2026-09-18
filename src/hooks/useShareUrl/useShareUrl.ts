import { useCopyToClipboard } from '@/hooks/useCopyToClipboard/useCopyToClipboard';
import { useIsTouchDevice } from '@/hooks/useIsTouchDevice/useIsTouchDevice';

interface UseShareUrlOptions {
  /** Title handed to the native share sheet alongside the URL. */
  title?: string;
  successTitle?: string;
  errorDescription?: string;
}

/**
 * Hands a URL over to the platform.
 *
 * The clipboard is the default path: the control that calls this is labelled
 * "Copy link", and the Web Share API is not mobile-only (desktop Safari exposes
 * it), so preferring the sheet whenever `navigator.share` exists would open a
 * share dialog instead of copying. The sheet is used only on touch devices,
 * where an installed PWA has no address bar and the sheet is the only way to
 * move a link straight into another app. A share attempt that fails for a reason
 * other than the user dismissing the sheet falls back to the clipboard.
 */
export function useShareUrl(options: UseShareUrlOptions = {}) {
  const {
    title,
    successTitle = 'Link copied to clipboard',
    errorDescription = 'Could not copy to clipboard',
  } = options;

  const { copyToClipboard } = useCopyToClipboard({ successTitle, errorDescription });
  const isTouchDevice = useIsTouchDevice();

  const shareUrl = async (url: string): Promise<boolean> => {
    // One payload for both calls: `canShare` answers whether the equivalent
    // `share` call would succeed, so a payload it never saw is a payload it
    // never validated.
    const shareData: ShareData = { url, ...(title ? { title } : {}) };

    if (isTouchDevice && canUseNativeShare(shareData)) {
      try {
        await navigator.share(shareData);
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

function canUseNativeShare(shareData: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return true;

  try {
    return navigator.canShare(shareData);
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}
