import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HumanVerificationStatus } from './HumanVerificationStatus';

describe('HumanVerificationStatus', () => {
  it('explains a blocked method when its mobile warning is tapped', () => {
    render(<HumanVerificationStatus layout="mobile" method="payment" reason="geoblocked" />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Why Bitcoin payment is unavailable' }));
    expect(screen.getByRole('dialog', { name: 'Not available in your country' })).toBeInTheDocument();
    expect(screen.getByText('Try a different verification method')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('distinguishes a phone service error from a country restriction', () => {
    render(<HumanVerificationStatus layout="mobile" method="phone" reason="error" />);

    fireEvent.click(screen.getByRole('button', { name: 'Why phone verification is unavailable' }));
    expect(screen.getByRole('dialog', { name: 'Service temporarily unavailable' })).toBeInTheDocument();
    expect(screen.queryByText('Not available in your country')).not.toBeInTheDocument();
  });

  it('announces country restrictions on desktop', () => {
    render(<HumanVerificationStatus layout="desktop" method="payment" reason="geoblocked" testId="warning" />);

    expect(screen.getByRole('status')).toHaveTextContent('Not available in your country');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
