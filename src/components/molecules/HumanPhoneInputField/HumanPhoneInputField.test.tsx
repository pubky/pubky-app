import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HumanPhoneInputField } from './HumanPhoneInputField';

describe('HumanPhoneInputField', () => {
  it('renders an inline error when provided', () => {
    render(<HumanPhoneInputField value="+12345678" onChange={() => {}} error="Enter a valid mobile number" />);
    expect(screen.getByTestId('human-phone-input-error')).toHaveTextContent('Enter a valid mobile number');
    expect(screen.getByTestId('human-phone-input')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('human-phone-input')).toHaveAttribute('aria-describedby', 'human-phone-input-error');
    expect(screen.getByTestId('human-phone-input-error')).toHaveAttribute('id', 'human-phone-input-error');
  });
});

describe('HumanPhoneInputField - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneInputField value="" onChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with error', () => {
    const { container } = render(
      <HumanPhoneInputField value="+12345678" onChange={() => {}} error="Enter a valid mobile number" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
