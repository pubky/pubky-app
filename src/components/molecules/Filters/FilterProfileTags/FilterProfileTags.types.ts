export interface FilterProfileTagsProps {
  selectedTags: string[];
  onTagAdd: (tag: string) => void;
  onTagRemove: (tag: string) => void;
  disabled?: boolean;
  maxTags?: number;
}
