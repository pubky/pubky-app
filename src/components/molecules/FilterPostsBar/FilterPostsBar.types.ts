export interface FilterPostsBarProps {
  /** Raw input value (controlled). */
  value: string;
  /** Called with the raw input string on every change. */
  onValueChange: (value: string) => void;
}
