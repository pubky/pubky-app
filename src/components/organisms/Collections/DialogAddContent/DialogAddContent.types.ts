import type { AddContentTarget } from '@/hooks/useAddContentForm/useAddContentForm.types';

export type DialogAddContentTriggerVariant = 'hero' | 'grid';

export interface DialogAddContentProps {
  dataCy?: string;
  disabled?: boolean;
  target?: AddContentTarget;
  /**
   * `hero` — pill button for collection/bookmarks hero actions.
   * `grid` — dashed tile for the last cell in bookmarks/collection grids.
   */
  triggerVariant?: DialogAddContentTriggerVariant;
}
