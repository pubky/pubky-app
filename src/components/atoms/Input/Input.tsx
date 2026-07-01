import * as React from 'react';
import { cn } from '@/libs/utils/utils';

type InputTheme = 'default' | 'outline';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: React.HTMLAttributes<HTMLInputElement>['className'];
  theme?: InputTheme;
}

const defaultProps = {
  type: 'text',
  theme: 'default',
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ ...props }, ref) => {
  const { theme } = { ...defaultProps, ...props };

  const inputClassName = cn(
    'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-input disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    'hover:ring-0 hover:outline-none focus:ring-0 focus:ring-offset-0 focus:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-destructive/40',
    theme === 'outline' && 'border-input',
    props.className,
  );

  return <input ref={ref} data-testid="input" {...props} className={inputClassName} />;
});

Input.displayName = 'Input';
