'use client';

import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';

import * as Libs from '@/libs';
import * as Types from './Breadcrumb.types';

// Shadcn-based Breadcrumb with custom variants
const breadcrumbVariants = cva('flex flex-wrap items-center', {
  variants: {
    size: {
      sm: 'gap-1.5',
      md: 'gap-2.5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

const breadcrumbItemVariants = cva('flex items-center justify-center gap-2.5', {
  variants: {
    variant: {
      link: 'text-muted-foreground hover:text-foreground transition-colors cursor-pointer',
      current: 'text-foreground',
      ellipsis: 'text-muted-foreground',
      dropdown: 'text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded overflow-hidden',
    },
  },
  defaultVariants: {
    variant: 'link',
  },
});

// Separator size differs between sm (15px) and md (16px) per Figma specs
const breadcrumbSeparatorVariants = cva('text-muted-foreground shrink-0', {
  variants: {
    size: {
      sm: 'w-[15px] h-[15px]',
      md: 'w-4 h-4',
    },
  },
  defaultVariants: {
    size: 'md',
  },
});

// Main Breadcrumb container - based on Shadcn
export const Breadcrumb = React.forwardRef<HTMLElement, Types.BreadcrumbProps>(
  ({ className, size, children, ...props }, ref) => (
    <nav ref={ref} aria-label="breadcrumb" className={Libs.cn('inline-flex', className)} {...props}>
      <ol className={breadcrumbVariants({ size })}>{children}</ol>
    </nav>
  ),
);
Breadcrumb.displayName = 'Breadcrumb';

// BreadcrumbList - Shadcn primitive
export const BreadcrumbList = React.forwardRef<HTMLOListElement, React.ComponentPropsWithoutRef<'ol'>>(
  ({ className, ...props }, ref) => (
    <ol
      ref={ref}
      className={Libs.cn(
        'flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground sm:gap-2.5',
        className,
      )}
      {...props}
    />
  ),
);
BreadcrumbList.displayName = 'BreadcrumbList';

// BreadcrumbItem - Custom implementation with Shadcn base
export const BreadcrumbItem = React.forwardRef<HTMLLIElement, Types.BreadcrumbItemProps>(
  ({ className, variant, children, href, dropdown, onClick, ...props }, ref) => {
    const itemVariant = variant || (dropdown ? 'dropdown' : 'link');

    const content = (
      <>
        <span className="font-sans text-sm leading-5 font-bold">{children}</span>
        {dropdown && <Libs.ChevronDown className="h-[15px] w-[15px]" />}
      </>
    );

    return (
      <li
        ref={ref}
        className={Libs.cn(breadcrumbItemVariants({ variant: itemVariant }), className)}
        onClick={onClick}
        {...props}
      >
        {href && !dropdown ? (
          <a href={href} className="flex items-center gap-1">
            {content}
          </a>
        ) : (
          <button type="button" className="flex items-center gap-1">
            {content}
          </button>
        )}
      </li>
    );
  },
);
BreadcrumbItem.displayName = 'BreadcrumbItem';

// BreadcrumbLink - Shadcn primitive
export const BreadcrumbLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentPropsWithoutRef<'a'> & {
    asChild?: boolean;
  }
>(({ asChild, className, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'a';

  return <Comp ref={ref} className={Libs.cn('transition-colors hover:text-foreground', className)} {...props} />;
});
BreadcrumbLink.displayName = 'BreadcrumbLink';

// BreadcrumbSeparator - Custom implementation with Shadcn base
export const BreadcrumbSeparator = React.forwardRef<HTMLLIElement, Types.BreadcrumbSeparatorProps>(
  ({ className, icon, size, ...props }, ref) => (
    <li
      ref={ref}
      role="presentation"
      aria-hidden="true"
      className={Libs.cn(breadcrumbSeparatorVariants({ size }), className)}
      {...props}
    >
      {icon || <Libs.ChevronRight className="h-full w-full" />}
    </li>
  ),
);
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

// BreadcrumbEllipsis - Shadcn primitive with custom styling
export const BreadcrumbEllipsis = React.forwardRef<HTMLSpanElement, Types.BreadcrumbEllipsisProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="presentation"
      aria-hidden="true"
      className={Libs.cn('flex h-9 w-9 items-center justify-center', className)}
      {...props}
    >
      <Libs.MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More</span>
    </span>
  ),
);
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

// BreadcrumbPage - Shadcn primitive
export const BreadcrumbPage = React.forwardRef<HTMLSpanElement, React.ComponentPropsWithoutRef<'span'>>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={Libs.cn('font-normal text-foreground', className)}
      {...props}
    />
  ),
);
BreadcrumbPage.displayName = 'BreadcrumbPage';

// Export variants for external use
export { breadcrumbVariants, breadcrumbItemVariants, breadcrumbSeparatorVariants };
