import { forwardRef } from 'react';
import * as Types from './Container.types';
import { cn } from '@/libs/utils/utils';

export const Container = forwardRef<
  HTMLDivElement | HTMLHtmlElement | HTMLBodyElement,
  Types.ContainerProps & React.HTMLAttributes<HTMLDivElement>
>(function Container(
  {
    as = 'div',
    size = 'default',
    display = 'flex',
    overrideDefaults = false,
    'data-testid': dataTestId,
    className,
    ...props
  }: Types.ContainerProps,
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

  const Tag = (as || 'div') as React.ElementType;

  // Only pass ref when component is a div
  const elementProps: Types.ContainerElementProps = {
    ...props,
    'data-testid': dataTestId || 'container',
    className: containerClassName,
    ref: ref as React.Ref<HTMLDivElement>,
  };

  return <Tag {...elementProps}>{props.children}</Tag>;
});
