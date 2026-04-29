import * as React from 'react';

export interface TagProps {
  name: string;
  count?: number;
  clicked?: boolean;
  onClick?: (tagName: string) => void;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  'data-testid'?: string;
  'data-cy'?: string;
  countDataCy?: string;
  style?: React.CSSProperties;
}
