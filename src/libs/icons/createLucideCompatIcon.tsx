import type { LucideProps } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/libs/utils/utils';

const toDisplayName = (kebabIconName: string) =>
  kebabIconName
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

/** Renders Lucide v0-compatible SVG markup (paths + lucide CSS classes) for icons changed or removed in v1. */
export const createLucideCompatIcon = (iconName: string, children: ReactNode) => {
  const LucideCompatIcon = ({ className, size = 24, ...props }: LucideProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide', `lucide-${iconName}`, className)}
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
  LucideCompatIcon.displayName = toDisplayName(iconName);
  return LucideCompatIcon;
};
