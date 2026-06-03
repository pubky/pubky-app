'use client';

import { type SVGProps, useId } from 'react';
import type { LucideProps } from 'lucide-react';

type ToastIconProps = LucideProps;

function ToastIconSvg({ size = 24, className, children, ...props }: LucideProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      {...(props as SVGProps<SVGSVGElement>)}
    >
      {children}
    </svg>
  );
}

/** Filled circle with a knocked-out check mark. */
export function ToastSuccessIcon({ size, className, ...props }: ToastIconProps) {
  const maskId = useId();

  return (
    <ToastIconSvg size={size} className={className} {...props}>
      <mask id={maskId}>
        <circle cx="12" cy="12" r="10" fill="white" />
        <path d="M8 12.5 10.5 15 16 9" stroke="black" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${maskId})`} />
    </ToastIconSvg>
  );
}

/** Filled circle with a knocked-out exclamation mark. */
export function ToastErrorIcon({ size, className, ...props }: ToastIconProps) {
  const maskId = useId();

  return (
    <ToastIconSvg size={size} className={className} {...props}>
      <mask id={maskId}>
        <circle cx="12" cy="12" r="10" fill="white" />
        <path d="M12 8v5" stroke="black" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1.25" fill="black" />
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${maskId})`} />
    </ToastIconSvg>
  );
}

/** Filled triangle-alert shape with a knocked-out exclamation mark. */
export function ToastWarningIcon({ size, className, ...props }: ToastIconProps) {
  const maskId = useId();
  const trianglePath = 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3';

  return (
    <ToastIconSvg size={size} className={className} {...props}>
      <mask id={maskId}>
        <path d={trianglePath} fill="white" />
        <path d="M12 9v4" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="17" r="1" fill="black" />
      </mask>
      <path d={trianglePath} fill="currentColor" mask={`url(#${maskId})`} />
    </ToastIconSvg>
  );
}

/** Filled circle with a knocked-out "i" mark. */
export function ToastInfoIcon({ size, className, ...props }: ToastIconProps) {
  const maskId = useId();

  return (
    <ToastIconSvg size={size} className={className} {...props}>
      <mask id={maskId}>
        <circle cx="12" cy="12" r="10" fill="white" />
        <circle cx="12" cy="8" r="1.25" fill="black" />
        <path d="M12 11v5" stroke="black" strokeWidth="2.5" strokeLinecap="round" />
      </mask>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${maskId})`} />
    </ToastIconSvg>
  );
}
