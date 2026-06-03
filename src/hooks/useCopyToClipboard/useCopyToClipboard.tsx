import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { copyToClipboard } from '@/libs/utils/utils';
import { toast } from '@/molecules/Toaster/use-toast';

interface UseCopyToClipboardOptions {
  onSuccess?: (text: string) => void;
  onError?: (error: Error) => void;
  successTitle?: string;
  errorDescription?: string;
}

export function useCopyToClipboard(options: UseCopyToClipboardOptions = {}) {
  const tCopy = useTranslations('toast.copy');
  const { onSuccess, onError, successTitle, errorDescription } = options;

  const resolvedSuccessTitle = successTitle ?? tCopy('pubkyCopied');
  const resolvedErrorDescription = errorDescription ?? tCopy('copyFailedDesc');

  const copyToClipboardHandler = useCallback(
    async (text: string) => {
      try {
        await copyToClipboard({ text });

        toast({
          variant: 'info',
          title: resolvedSuccessTitle,
          dismissButton: true,
        });

        onSuccess?.(text);
        return true;
      } catch (error) {
        toast({
          variant: 'error',
          description: resolvedErrorDescription,
        });

        onError?.(error as Error);
        return false;
      }
    },
    [onSuccess, onError, resolvedSuccessTitle, resolvedErrorDescription],
  );

  return { copyToClipboard: copyToClipboardHandler };
}
