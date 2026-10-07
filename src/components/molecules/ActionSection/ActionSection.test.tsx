import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionSection } from './ActionSection';

describe('ActionSection', () => {
  it('renders with actions', () => {
    const mockAction = vi.fn();
    const actions = [
      { label: 'Continue', onClick: mockAction, variant: 'default' as const },
      { label: 'Back', onClick: mockAction, variant: 'outline' as const },
    ];

    render(<ActionSection actions={actions} />);

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    const backButton = screen.getByRole('button', { name: 'Back' });

    expect(continueButton).toBeInTheDocument();
    expect(continueButton).toHaveTextContent('Continue');
    expect(backButton).toBeInTheDocument();
    expect(backButton).toHaveTextContent('Back');
  });
});
