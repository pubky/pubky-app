export const DEFAULT_TEXTAREA_ROWS = 4;

/**
 * Shared validation patterns for form inputs
 */
export const VALIDATION_PATTERNS = {
  /** Email regex pattern - matches standard email format */
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  /** Phone number regex - allows digits, spaces, dashes, plus, parentheses, dots, commas, hash, star, and 'ext' */
  PHONE: /^[\d\s\-+().,#*ext]+$/i,
} as const;

/**
 * Shared validation error messages
 */
export const VALIDATION_MESSAGES = {
  INVALID_EMAIL: 'Please enter a valid email address',
  INVALID_PHONE: 'Please enter a valid phone number',
  INVALID_URL: 'Please enter a valid URL',
  ROLE_REQUIRED: 'Please select if you are the rights owner or reporting on behalf',
} as const;

/**
 * Shared label classes for controlled form fields
 */
export const FORM_LABEL_CLASSES = 'text-xs font-medium tracking-wide text-muted-foreground uppercase';

/** The wrapper draws the focus ring around the input and any attached icons. */
export const FIELD_STATUS_CLASSES = {
  default: 'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
  success: 'border-brand text-brand focus-within:ring-[3px] focus-within:ring-ring/50',
  error:
    'border-destructive text-error-foreground focus-within:ring-[3px] focus-within:ring-destructive/40 light:focus-within:ring-destructive/20',
} as const;

export const FIELD_MESSAGE_CLASSES = {
  default: 'text-muted-foreground',
  info: 'text-blue-500',
  alert: 'text-yellow-500',
  error: 'text-error-foreground',
  success: 'text-brand',
} as const;
