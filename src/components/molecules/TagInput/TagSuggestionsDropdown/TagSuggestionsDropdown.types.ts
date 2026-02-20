export interface TagSuggestionsDropdownProps {
  suggestions: Array<{ label: string }>;
  selectedIndex: number | null;
  onSelect: (label: string) => void;
  onSelectIndexChange: (index: number) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}
