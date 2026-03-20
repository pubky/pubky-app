export interface ShowMoreRepliesProps {
  /** Number of remaining replies to show */
  count: number;
  /** Callback when the button is clicked */
  onClick: () => void;
  /** Whether this is the last element in the thread (affects connector variant) */
  isLast?: boolean;
}
