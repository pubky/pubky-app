import type { ReactNode } from 'react';

export type ContainerElement =
  | 'div'
  | 'section'
  | 'article'
  | 'main'
  | 'header'
  | 'footer'
  | 'aside'
  | 'nav'
  | 'body'
  | 'html'
  | 'figure';
export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | 'container' | 'default';
export type ContainerDisplay = 'flex' | 'grid' | 'block';

export type ContainerProps = {
  as?: ContainerElement | 'div';
  children?: ReactNode;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  size?: ContainerSize;
  display?: ContainerDisplay;
  overrideDefaults?: boolean;
  'data-testid'?: string;
  role?: React.HTMLAttributes<HTMLElement>['role'];
  onClick?: React.HTMLAttributes<HTMLElement>['onClick'];
  style?: React.CSSProperties;
  title?: string;
  'aria-modal'?: React.AriaAttributes['aria-modal'];
  'aria-label'?: React.AriaAttributes['aria-label'];
  tabIndex?: React.HTMLAttributes<HTMLElement>['tabIndex'];
  /** HTML lang attribute for the element */
  lang?: string;
  /** HTML dir attribute for text direction (ltr, rtl, auto) */
  dir?: React.HTMLAttributes<HTMLElement>['dir'];
  /** HTML translate attribute to disable browser translation */
  translate?: 'yes' | 'no';
};

export interface ContainerElementProps extends React.HTMLAttributes<HTMLElement> {
  ref?: React.Ref<HTMLDivElement>;
  'data-testid'?: string;
}
