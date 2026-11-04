export interface LocksRegionNoticeProps {
  /** `region`: the viewer's region is on the blocked list. `unknown`: it could not be read and unknown viewers are held. */
  cause?: 'region' | 'unknown';
  /** `line`: the sentence with an info icon. `icon`: the info icon alone, for a toolbar with no room for a sentence. */
  variant?: 'line' | 'icon';
  className?: string;
}
