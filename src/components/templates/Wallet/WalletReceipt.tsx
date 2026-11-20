'use client';

import { useEffect } from 'react';
import type { ReceiveStatus } from '@beignet/wallet-core';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { bitcoinAmount } from '@/libs/wallet/amount';

export function WalletBalance({ amount }: { amount: number }) {
  const reduced = useReducedMotion();
  const value = useMotionValue(amount);
  const formatted = useTransform(value, (n) => bitcoinAmount(Math.round(n)));
  useEffect(() => {
    if (reduced || value.get() >= amount) {
      value.set(amount);
      return;
    }
    const animation = animate(value, amount, { duration: 0.38, ease: [0.22, 1, 0.36, 1] });
    return () => animation.stop();
  }, [amount, reduced, value]);
  return (
    <span role="group" aria-label={bitcoinAmount(amount)}>
      <motion.span aria-hidden="true">{formatted}</motion.span>
    </span>
  );
}

export function WalletReceipt({
  receipt,
  description,
  animateEntrance,
}: {
  receipt: ReceiveStatus;
  description: string;
  animateEntrance: boolean;
}) {
  const reduced = useReducedMotion();
  const immediate = reduced || !animateEntrance;
  return (
    <motion.div
      className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-6 text-center"
      initial={immediate ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      <motion.svg
        aria-hidden="true"
        viewBox="0 0 56 56"
        className="mb-1 size-14 text-brand"
        fill="none"
        initial={immediate ? false : { scale: 0.85 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        <circle cx="28" cy="28" r="26" fill="currentColor" opacity="0.12" />
        <motion.path
          d="m16.5 28 7.5 7.5 15-15"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={immediate ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: immediate ? 0 : 0.28, delay: immediate ? 0 : 0.06 }}
        />
      </motion.svg>
      <p className="text-sm font-medium text-muted-foreground">Payment received</p>
      <p className="text-3xl font-bold tracking-tight tabular-nums">{bitcoinAmount(receipt.receivedSats)}</p>
      {description && <p className="max-w-full truncate text-sm text-muted-foreground">{description}</p>}
    </motion.div>
  );
}
