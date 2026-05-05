import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HumanPhoneInputField } from './HumanPhoneInputField';

describe('HumanPhoneInputField', () => {
  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneInputField value="" onChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
