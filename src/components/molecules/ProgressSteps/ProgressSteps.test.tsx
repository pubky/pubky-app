import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressSteps } from './ProgressSteps';

describe('ProgressSteps', () => {
  it('renders with default props', () => {
    render(<ProgressSteps currentStep={1} totalSteps={5} />);

    // Check that both desktop and mobile versions are rendered
    const desktopSteps = document.querySelector('.hidden.lg\\:flex');
    const mobileSteps = document.querySelector('.flex.lg\\:hidden');

    expect(desktopSteps).toBeInTheDocument();
    expect(mobileSteps).toBeInTheDocument();
  });
});

describe('ProgressSteps - Snapshots', () => {
  it('matches snapshot for ProgressSteps with initial step', () => {
    const { container } = render(<ProgressSteps currentStep={1} totalSteps={5} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProgressSteps with partial steps', () => {
    const { container } = render(<ProgressSteps currentStep={2} totalSteps={5} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProgressSteps with middle step', () => {
    const { container } = render(<ProgressSteps currentStep={3} totalSteps={5} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProgressSteps with final step', () => {
    const { container } = render(<ProgressSteps currentStep={5} totalSteps={5} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProgressSteps with single step', () => {
    const { container } = render(<ProgressSteps currentStep={1} totalSteps={1} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProgressSteps with custom className', () => {
    const { container } = render(<ProgressSteps currentStep={2} totalSteps={4} className="custom-progress" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
