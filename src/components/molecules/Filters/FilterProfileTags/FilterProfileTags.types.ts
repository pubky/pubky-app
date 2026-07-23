import type { ProfileTagScopeType } from '@/stores/home/home.types';

export interface FilterProfileTagsProps {
  selectedTags: string[];
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  scope: ProfileTagScopeType;
  onScopeChange: (scope: ProfileTagScopeType) => void;
  hidden?: boolean;
  inputDisabled?: boolean;
  onInputClick?: () => void;
  maxTags?: number;
}
