'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { TLockConfig } from '@/application/locks/locks.types';
import { parseLockPrice } from '@/libs/utils/lockPrice';
import { type LockContentFormData, lockContentFormDefaults, lockContentFormSchema } from './useLockContentForm.types';

export function useLockContentForm(onApplied: (config: TLockConfig) => void) {
  const form = useForm<LockContentFormData>({
    resolver: zodResolver(lockContentFormSchema),
    defaultValues: lockContentFormDefaults,
    mode: 'onChange',
  });

  const reset = () => form.reset(lockContentFormDefaults);

  const changeAsset = (asset: string) => {
    if (asset !== 'BTC' && asset !== 'USD') return;
    form.reset({ ...lockContentFormDefaults, asset });
  };

  // Applying only records the price. The composer's Post button publishes the lock.
  const submit = async (): Promise<boolean> => {
    let applied = false;
    await form.handleSubmit(({ amount, asset }) => {
      const price = parseLockPrice(amount, asset);
      if (!price) return;
      onApplied(price);
      applied = true;
    })();
    return applied;
  };

  return { form, submit, reset, changeAsset };
}
