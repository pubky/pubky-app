export interface RepostTextProps {
  /** Translation template containing NAME_TOKEN placeholder */
  template: string;
  /** The name to display (will be truncated if too long) */
  name: string;
  /** Whether to preserve space before suffix (for desktop layout) */
  preserveSpace?: boolean;
}

/** Token used as placeholder for the name in translation templates */
export const NAME_TOKEN = '__REPOSTER_NAME__';
