import React, { useCallback } from 'react';
import { useTranslations } from 'next-intl';

import * as Libs from '@/libs';
import * as Molecules from '@/molecules';
import * as Atoms from '@/atoms';

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
        await Libs.copyToClipboard({ text });

        const toastInstance = Molecules.toast({
          title: resolvedSuccessTitle,
          description: text,
          action: (
            <Atoms.Button size="sm" className="text-xs font-bold" onClick={() => toastInstance.dismiss()}>
              {tCopy('ok')}
            </Atoms.Button>
          ),
        });

        onSuccess?.(text);
        return true;
      } catch (error) {
        Molecules.toast({
          title: resolvedErrorTitle,
          description: resolvedErrorDescription,
        });

        onError?.(error as Error);
        return false;
      }
    },
    [onSuccess, onError, resolvedSuccessTitle, resolvedErrorTitle, resolvedErrorDescription, tCopy],
  );

  return { copyToClipboard: copyToClipboardHandler };
}
