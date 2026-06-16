import type { CSSProperties } from 'react';

export interface UseElementKeyboardAvoidanceOptions {
  /**
   * Whether the hook should calculate and listen for keyboard avoidance updates.
   * Default: true.
   */
  enabled?: boolean;
  /**
   * Minimum space to keep between the element bottom and the visual viewport bottom.
   * Default: 0px (the element sits flush against the keyboard).
   */
  bottomMargin?: number;
  /**
   * Height difference needed to treat the visual viewport shrink as a keyboard.
   * Default: 150px.
   */
  threshold?: number;
}

export interface UseElementKeyboardAvoidanceResult {
  isKeyboardVisible: boolean;
  keyboardAvoidanceOffset: number;
  keyboardAvoidanceStyle: CSSProperties | undefined;
}
