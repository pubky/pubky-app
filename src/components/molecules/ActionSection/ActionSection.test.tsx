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

describe('ActionSection - Snapshots', () => {
  it('matches snapshot with default props', () => {
    const { container } = render(<ActionSection />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with custom className', () => {
    const { container } = render(<ActionSection className="custom-actions" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with children', () => {
    const { container } = render(
      <ActionSection>
        <div>Custom content</div>
      </ActionSection>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with single action', () => {
    const mockAction = vi.fn();

    const { container } = render(<ActionSection actions={[{ label: 'Single Action', onClick: mockAction }]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with multiple actions', () => {
    const mockAction = vi.fn();

    const { container } = render(
      <ActionSection
        actions={[
          { label: 'Continue', onClick: mockAction, variant: 'default' as const },
          { label: 'Back', onClick: mockAction, variant: 'outline' as const },
        ]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with action containing icon', () => {
    const mockAction = vi.fn();

    const { container } = render(
      <ActionSection
        actions={[
          {
            label: 'Action with Icon',
            icon: <span>🚀</span>,
            onClick: mockAction,
          },
        ]}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
