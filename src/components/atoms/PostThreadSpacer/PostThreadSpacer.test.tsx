import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PostThreadSpacer } from './PostThreadSpacer';

describe('PostThreadSpacer', () => {
  describe('Functionality', () => {
    it('renders correctly with expected structure and spacing', () => {
      const { container } = render(<PostThreadSpacer data-testid="spacer" />);
      const spacer = container.querySelector('[data-testid="spacer"]');

      // Verify component renders
      expect(spacer).toBeInTheDocument();

      // Verify correct height (matches Figma spacing of 12px)
      expect(spacer).toHaveClass('h-3');

      // Verify vertical line structure
      const borderLine = spacer?.firstChild as HTMLElement;
      expect(borderLine).toHaveClass('border-l');
      expect(borderLine).toHaveClass('border-border');
    });
  });
});
