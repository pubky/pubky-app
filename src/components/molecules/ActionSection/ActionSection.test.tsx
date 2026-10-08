import { fireEvent, render, screen } from '@testing-library/react';
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

  it('renders children without an actions row when no actions are given', () => {
    render(
      <ActionSection>
        <p>Section body</p>
      </ActionSection>,
    );

    expect(screen.getByText('Section body')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('uses the secondary variant by default and honours an explicit variant', () => {
    render(
      <ActionSection
        actions={[
          { label: 'Default', onClick: vi.fn() },
          { label: 'Brand', onClick: vi.fn(), variant: 'brand' },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute('data-variant', 'secondary');
    expect(screen.getByRole('button', { name: 'Brand' })).toHaveAttribute('data-variant', 'brand');
  });

  it('renders the action icon before the label', () => {
    render(<ActionSection actions={[{ label: 'Save', onClick: vi.fn(), icon: <span data-testid="action-icon" /> }]} />);

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toContainElement(screen.getByTestId('action-icon'));
    expect(button.firstElementChild).toBe(screen.getByTestId('action-icon'));
  });

  it('applies id, disabled, className and click handler per action', () => {
    const handleClick = vi.fn();
    render(
      <ActionSection
        actions={[
          { id: 'save-action', label: 'Save', onClick: handleClick, className: 'custom-action' },
          { label: 'Blocked', onClick: vi.fn(), disabled: true },
        ]}
      />,
    );

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toHaveAttribute('id', 'save-action');
    expect(save).toHaveClass('rounded-full', 'custom-action');
    fireEvent.click(save);
    expect(handleClick).toHaveBeenCalledTimes(1);

    expect(screen.getByRole('button', { name: 'Blocked' })).toBeDisabled();
  });
});
