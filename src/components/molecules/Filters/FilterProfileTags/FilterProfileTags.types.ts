import type { ReachType } from '@/stores/home/home.types';

export interface FilterProfileTagsProps {
  selectedTags: string[];
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  /** Selected reach; drives the desktop tooltip explaining profile-tag effect. */
  reach?: ReachType;
  disabled?: boolean;
  maxTags?: number;
}
