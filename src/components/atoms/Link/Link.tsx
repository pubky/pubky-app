import { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import NextLink from 'next/link';
import { cn } from '@/libs/utils/utils';

interface LinkProps extends ComponentProps<typeof NextLink> {
  variant?: 'default' | 'muted';
  size?: 'default' | 'lg' | 'xl';
  overrideDefaults?: boolean;
}

/**
 * Smart Link component with automatic external URL detection
 *
 * **Automatic Behavior (99% of cases):**
 * - Internal links (`/profile`) → Next.js Link with client-side navigation
 * - External links (`https://...`) → Native <a> with target="_blank" and security attributes
 *
 * **Escape Hatch (1% of cases):**
 * You can override the default behavior by passing `target` or `rel` props:
 *
 * @example
 * // ✅ Automatic (recommended)
 * <Link href="/profile">Profile</Link>              // → NextLink
 * <Link href="https://google.com">Google</Link>     // → <a target="_blank">
 *
 * @example
 * // 🔧 Override when needed
 * <Link href="https://..." target="_self">No new tab</Link>
 * <Link href="https://..." rel="nofollow">SEO control</Link>
 *
 * @example
 * // 🚨 Edge cases - use native <a> directly
 * <a href="mailto:...">Email</a>
 * <a href="tel:...">Phone</a>
 */
export function Link({
  variant = 'default',
  size = 'default',
  overrideDefaults = false,
  className,
  ...props
}: LinkProps) {
  const linkVariants = cva('cursor-pointer text-brand hover:text-brand/80 transition-colors', {
    variants: {
      variant: {
        default: 'text-brand',
        muted: 'text-muted-foreground hover:text-brand',
      },
      size: {
        default: 'text-sm',
        lg: 'text-lg',
        xl: 'text-xl',
      },
    },
  });

  const linkClassName = overrideDefaults ? className : cn(linkVariants({ variant, size }), className);

  // Check if href is an external URL
  const href = props.href?.toString() || '';
  const isExternal = href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//');

  // For external links, use native <a> tag with security defaults
  if (isExternal) {
    const {
      target = '_blank', // Default to new tab, but allow override
      rel = 'noopener noreferrer', // Default security, but allow override
      ...restProps
    } = props as React.AnchorHTMLAttributes<HTMLAnchorElement>;

    return (
      <a {...restProps} href={href} className={linkClassName} target={target} rel={rel}>
        {props.children}
      </a>
    );
  }

  // For internal links, use Next.js Link
  return (
    <NextLink className={linkClassName} {...props}>
      {props.children}
    </NextLink>
  );
}
