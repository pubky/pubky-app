'use client';

import { toast } from './use-toast';

const ERROR_TOAST_CLASSNAME = 'destructive border-destructive bg-destructive text-destructive-foreground';

interface ShowErrorToastParams {
  title?: string;
  description: string;
}

export function showErrorToast({ title = 'Error', description }: ShowErrorToastParams) {
  toast({
    title,
    description,
    className: ERROR_TOAST_CLASSNAME,
  });
}
