import { type ElementType, forwardRef, type HTMLAttributes, type Ref } from 'react';
import { cn } from '@/libs/utils/utils';
import type { ContainerElementProps, ContainerProps } from './Container.types';

export const Container = forwardRef<
  HTMLDivElement | HTMLHtmlElement | HTMLBodyElement,
  ContainerProps & HTMLAttributes<HTMLDivElement>
>(function Container(
  {
    as = 'div',
    size = 'default',
    display = 'flex',
    overrideDefaults = false,
    'data-testid': dataTestId,
    className,
    ...props
  }: ContainerProps,
  ref,
) {
  const defaultClasses = 'mx-auto w-full flex-col';
  const displayClasses = {
    flex: 'flex',
    grid: 'grid',
    block: 'block',
  };
  const sizeClasses = {
    default: '',
    sm: 'max-w-screen-sm',
    md: 'max-w-screen-md',
    lg: 'max-w-screen-lg',
    xl: 'max-w-screen-xl',
    container: 'container max-w-(--container-max-width)',
  };

  const containerClassName = overrideDefaults
    ? cn(className)
    : cn(defaultClasses, displayClasses[display], sizeClasses[size], className);

  const Tag = (as || 'div') as ElementType;

  // Only pass ref when component is a div
  const elementProps: ContainerElementProps = {
    ...props,
    'data-testid': dataTestId || 'container',
    className: containerClassName,
    ref: ref as Ref<HTMLDivElement>,
  };

  return <Tag {...elementProps}>{props.children}</Tag>;
});
