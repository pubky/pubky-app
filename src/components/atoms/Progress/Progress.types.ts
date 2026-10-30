import { Progress as ProgressPrimitive } from 'radix-ui';

export interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  /** 0 to 100; `null` or undefined renders the indeterminate bar. */
  value?: number | null;
}
