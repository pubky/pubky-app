import type { AddContentTarget } from '@/hooks/useAddContentForm/useAddContentForm.types';

export type DialogAddContentTriggerVariant = 'hero' | 'grid' | 'list';

export interface DialogAddContentProps {
  dataCy?: string;
  disabled?: boolean;
  target?: AddContentTarget;
  /**
   * `hero` — pill button for collection/bookmarks hero actions.
   * `grid` — dashed tile for the last cell in bookmarks/collection grids.
   * `list` — compact dashed row after the last post in a collection List layout.
   */
  triggerVariant?: DialogAddContentTriggerVariant;
}
