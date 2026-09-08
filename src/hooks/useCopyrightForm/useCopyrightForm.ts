'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type FieldErrors, useForm } from 'react-hook-form';
import { postJson } from '@/libs/api/client-request';
import { toast } from '@/molecules/Toaster/toast';
import { COPYRIGHT_ROLES, copyrightFormDefaultValues } from './useCopyrightForm.constants';
import { type CopyrightFormData, copyrightFormSchema } from './useCopyrightForm.types';

export function useCopyrightForm() {
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
      toast({ title: 'Request sent' });
    } catch (error) {
      toast({
        variant: 'error',
        description: error instanceof Error ? error.message : 'Could not send request',
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
