import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileNavigation } from './ProfileNavigation';

describe('ProfileNavigation - Snapshots', () => {
  const defaultProps = {
    continueButtonDisabled: false,
    continueText: 'Finish',
    onContinue: vi.fn(),
  };

  it('matches snapshot for default ProfileNavigation', () => {
    const { container } = render(<ProfileNavigation {...defaultProps} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProfileNavigation with different configurations', () => {
    const { container } = render(
      <ProfileNavigation
        {...defaultProps}
        continueText="Complete"
        backText="Previous"
        className="custom-nav"
        onHandleBackButton={vi.fn()}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProfileNavigation with disabled states', () => {
    const { container } = render(
      <ProfileNavigation {...defaultProps} continueButtonDisabled={true} backButtonDisabled={true} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProfileNavigation with loading state', () => {
    const { container } = render(<ProfileNavigation {...defaultProps} continueButtonLoading={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for ProfileNavigation with hidden continue button', () => {
    const { container } = render(<ProfileNavigation {...defaultProps} hiddenContinueButton={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
