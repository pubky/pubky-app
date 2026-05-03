import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from '@/molecules/Toaster/use-toast';

import { copyToClipboard } from '@/libs/utils/utils';

interface UseCopyToClipboardOptions {
  onSuccess?: (text: string) => void;
  onError?: (error: Error) => void;
  successTitle?: string;
  errorTitle?: string;
  errorDescription?: string;
}

export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const tCopy = useTranslations('toast.copy');
  const { onSuccess, onError, successTitle, errorTitle, errorDescription } = options;

  const resolvedSuccessTitle = successTitle ?? tCopy('pubkyCopied');
  const resolvedErrorTitle = errorTitle ?? tCopy('copyFailed');
  const resolvedErrorDescription = errorDescription ?? tCopy('copyFailedDesc');

  const copyToClipboardHandler = useCallback(
    async (text: string) => {
      try {
        await copyToClipboard({ text });

        toast({
          title: resolvedSuccessTitle,
          description: text,
          dismissButton: true,
        });

        onSuccess?.(text);
        return true;
      } catch (error) {
        toast({
          title: resolvedErrorTitle,
          description: resolvedErrorDescription,
        });

        onError?.(error as Error);
        return false;
      }
    },
    [onSuccess, onError, resolvedSuccessTitle, resolvedErrorTitle, resolvedErrorDescription],
  );

  return { copyToClipboard: copyToClipboardHandler };
}
