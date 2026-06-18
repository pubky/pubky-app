import type { AddContentTarget } from '@/hooks/useAddContentForm/useAddContentForm.types';

export interface AddContentDialogProps {
  className?: string;
  dataCy?: string;
  target?: AddContentTarget;
}
