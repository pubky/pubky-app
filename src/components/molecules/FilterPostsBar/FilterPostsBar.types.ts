export interface FilterPostsBarProps {
  /** Raw input value (controlled). */
  value: string;
  /** Called with the raw input string on every change. */
  onValueChange: (value: string) => void;
  /** Validator message for a settled-but-invalid query; rendered below the pill. */
  validationMessage?: string | null;
}
