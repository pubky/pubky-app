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
