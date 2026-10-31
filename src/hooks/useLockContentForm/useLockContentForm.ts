'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { TLockConfig } from '@/application/locks/locks.types';
import { lockPriceInputValue, parseLockPrice } from '@/libs/utils/lockPrice';
import { type LockContentFormData, lockContentFormDefaults, lockContentFormSchema } from './useLockContentForm.types';

const toFormValues = (price: TLockConfig | null): LockContentFormData =>
  price ? { amount: lockPriceInputValue(price), asset: price.asset } : lockContentFormDefaults;

/** `price` is the applied price: the form starts from it, so reopening the dialog changes that price. */
export function useLockContentForm({
  open,
  price,
  onApplied,
}: {
  open: boolean;
  price: TLockConfig | null;
  onApplied: (config: TLockConfig) => void;
}) {
  const form = useForm<LockContentFormData>({
    resolver: zodResolver(lockContentFormSchema),
    defaultValues: toFormValues(price),
    mode: 'onChange',
  });

  // Re-seed only while the dialog is closed: closing drops what was typed, Apply sets the price the next
  // open starts from, and a published or abandoned lock clears it. An open dialog keeps what is typed.
  useEffect(() => {
    if (open) return;
    form.reset(toFormValues(price));
  }, [open, price, form]);

  const changeAsset = (asset: string) => {
    if (asset !== 'BTC' && asset !== 'USD') return;
    form.reset({ ...lockContentFormDefaults, asset });
  };

  // Applying only records the price. The composer's Post button publishes the lock.
  const submit = async (): Promise<boolean> => {
    let applied = false;
    await form.handleSubmit(({ amount, asset }) => {
      const config = parseLockPrice(amount, asset);
      if (!config) return;
      onApplied(config);
      applied = true;
    })();
    return applied;
  };

  return { form, submit, changeAsset };
}
