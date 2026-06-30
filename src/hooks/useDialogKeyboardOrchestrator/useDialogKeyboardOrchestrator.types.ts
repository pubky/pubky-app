import type { CSSProperties } from 'react';

export interface UseDialogKeyboardOrchestratorOptions {
  /**
   * Whether this dialog should opt into keyboard-aware internal scrolling.
   * Default: true.
   */
  enabled?: boolean;
  /**
   * Minimum distance between focused content and the top of the visible area.
   * Default: 16px.
   */
  topInset?: number;
  /**
   * Minimum distance between focused content and the keyboard top.
   * Default: 24px.
   */
  bottomMargin?: number;
  /**
   * Height difference needed to treat the visual viewport shrink as a keyboard.
   * Default: 150px.
   */
  threshold?: number;
}

export interface UseDialogKeyboardOrchestratorResult {
  isKeyboardVisible: boolean;
  spacerHeight: number;
  contentStyle: CSSProperties | undefined;
}
