import * as React from 'react';

export interface TagProps {
  name: string;
  count?: number;
  /** A wider count, shown muted after `count` as "(10)" (people across an external resource's services). */
  total?: number;
  /** `secondary`: a faint tint of the tag colour and a dashed edge, for a tag that is elsewhere but not here yet. */
  variant?: 'default' | 'secondary';
  clicked?: boolean;
  onClick?: (tagName: string) => void;
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  'data-testid'?: string;
  'data-cy'?: string;
  countDataCy?: string;
  style?: React.CSSProperties;
}
