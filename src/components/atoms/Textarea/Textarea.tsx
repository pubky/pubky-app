import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import * as Libs from '@/libs';

const textareaVariants = cva(
  'flex field-sizing-content w-full rounded-md bg-transparent text-base wrap-anywhere outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 transition-[color,box-shadow]',
  {
    variants: {
      variant: {
        default:
          'min-h-16 border border-input px-3 py-2 shadow-xs focus-visible:border-ring focus-visible:ring-ring/50',
        inline:
          'min-h-6 resize-none border-none p-0 font-medium text-secondary-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<'textarea'> & VariantProps<typeof textareaVariants>) {
  return <textarea data-slot="textarea" {...props} className={Libs.cn(textareaVariants({ variant }), className)} />;
}

export { Textarea, textareaVariants };
