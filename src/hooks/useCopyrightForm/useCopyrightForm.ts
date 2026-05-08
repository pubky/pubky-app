'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { type FieldErrors, useForm } from 'react-hook-form';
import { postJson } from '@/libs/api/client-request';
import { showErrorToast } from '@/molecules/Toaster/showErrorToast';
import { toast } from '@/molecules/Toaster/use-toast';
import { COPYRIGHT_ROLES, copyrightFormDefaultValues } from './useCopyrightForm.constants';
import { type CopyrightFormData, copyrightFormSchema } from './useCopyrightForm.types';

export function useCopyrightForm() {
  const tToast = useTranslations('toast');
  const tCopyright = useTranslations('toast.copyright');
  const form = useForm<CopyrightFormData>({
    resolver: zodResolver(copyrightFormSchema),
    defaultValues: copyrightFormDefaultValues,
    mode: 'onBlur',
  });

  const submitForm = async (data: CopyrightFormData) => {
    try {
      const { role, ...rest } = data;
      await postJson('/api/copyright', {
        ...rest,
        isRightsOwner: role === COPYRIGHT_ROLES.RIGHTS_OWNER,
        isReportingOnBehalf: role === COPYRIGHT_ROLES.REPORTING_ON_BEHALF,
      });

      form.reset();
      toast({ title: tToast('success'), description: tCopyright('success') });
    } catch (error) {
      showErrorToast({
        description: error instanceof Error ? error.message : tCopyright('error'),
      });
    }
  };

  const handleInvalidSubmit = (errors: FieldErrors<CopyrightFormData>) => {
    const [firstErrorField] = Object.keys(errors);
    if (!firstErrorField) return;

    const fieldElement =
      document.querySelector(`[name="${firstErrorField}"]`) ?? document.querySelector('[aria-invalid="true"]');

    if (fieldElement instanceof HTMLElement) {
      // Optional chaining handles test environments where these methods may not exist
      fieldElement.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      fieldElement.focus?.();
    }
  };

  const onSubmit = form.handleSubmit(submitForm, handleInvalidSubmit);

  return {
    form,
    onSubmit,
  };
}
