export interface FacehashAvatarProps {
  /** Seed string used for deterministic face generation */
  seed: string;
  /** Single character displayed in the mouth area of the face */
  initial: string;
  /** Additional CSS classes for the Facehash wrapper */
  className?: string;
}
