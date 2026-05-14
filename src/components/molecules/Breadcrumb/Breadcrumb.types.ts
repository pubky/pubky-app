import * as React from 'react';
import { type VariantProps } from 'class-variance-authority';
import { breadcrumbItemVariants, breadcrumbSeparatorVariants, breadcrumbVariants } from './Breadcrumb';

export interface BreadcrumbProps
  extends React.ComponentPropsWithoutRef<'nav'>, VariantProps<typeof breadcrumbVariants> {
  children: React.ReactNode;
  separator?: React.ReactNode;
}

export interface BreadcrumbItemProps
  extends React.ComponentPropsWithoutRef<'li'>, VariantProps<typeof breadcrumbItemVariants> {
  children: React.ReactNode;
  href?: string;
  dropdown?: boolean;
}

export interface BreadcrumbSeparatorProps
  extends React.ComponentPropsWithoutRef<'li'>, VariantProps<typeof breadcrumbSeparatorVariants> {
  icon?: React.ReactNode;
}

export interface BreadcrumbEllipsisProps extends React.ComponentPropsWithoutRef<'span'> {
  className?: string;
}
