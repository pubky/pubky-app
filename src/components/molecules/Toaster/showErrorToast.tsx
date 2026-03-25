'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from './use-toast';

const ERROR_TOAST_CLASSNAME = 'destructive border-destructive bg-destructive text-destructive-foreground shadow-lg';

interface ShowErrorToastParams {
  title?: ReactNode;
  description: string;
}

function DefaultErrorToastTitle() {
  const t = useTranslations('toast');
  return <>{t('genericErrorTitle')}</>;
}

export function showErrorToast({ title, description }: ShowErrorToastParams) {
  toast({
    title: title ?? <DefaultErrorToastTitle />,
    description: <span className="text-destructive-foreground">{description}</span>,
    className: ERROR_TOAST_CLASSNAME,
  });
}
