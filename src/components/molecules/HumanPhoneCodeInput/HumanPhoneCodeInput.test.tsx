import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

import { HumanPhoneCodeInput } from './HumanPhoneCodeInput';

describe('HumanPhoneCodeInput', () => {
  it('Change the code by typing in the inputs', () => {
    const Wrapper = () => {
      const [code, setCode] = useState(['', '', '', '', '', '']);
      return <HumanPhoneCodeInput value={code} onChange={setCode} />;
    };

    const { container } = render(<Wrapper />);

    fireEvent.change(container.querySelector('#human-phone-code-input-0-input')!, { target: { value: '1' } });
    fireEvent.change(container.querySelector('#human-phone-code-input-1-input')!, { target: { value: '1' } });
    fireEvent.change(container.querySelector('#human-phone-code-input-2-input')!, { target: { value: '1' } });
    fireEvent.change(container.querySelector('#human-phone-code-input-3-input')!, { target: { value: '1' } });
    fireEvent.change(container.querySelector('#human-phone-code-input-4-input')!, { target: { value: '1' } });
    fireEvent.change(container.querySelector('#human-phone-code-input-5-input')!, { target: { value: '1' } });

    const values = Array.from(container.querySelectorAll('input')).map((input) => (input as HTMLInputElement).value);

    expect(values).toEqual(['1', '1', '1', '1', '1', '1']);
  });

  // it('renders the supporting subtitle copy', () => {
  //   render(<HumanPhoneCodeInput value={['','','','','','']} onChange={() => {}} />);

  //   expect(
  //     screen.getByText('Prove your humanity. This keeps the arena real and fair for everyone.'),
  //   ).toBeInTheDocument();
  // });

  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneCodeInput value={['', '', '', '', '', '']} onChange={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('auto-selects content when backspace moves focus to previous input with existing digit', () => {
    const Wrapper = () => {
      const [code, setCode] = useState(['1', '2', '', '', '', '']);
      return <HumanPhoneCodeInput value={code} onChange={setCode} />;
    };

    const { container } = render(<Wrapper />);

    const input2 = container.querySelector('#human-phone-code-input-2-input') as HTMLInputElement;
    const input1 = container.querySelector('#human-phone-code-input-1-input') as HTMLInputElement;

    // Focus on empty input at index 2
    input2.focus();
    expect(document.activeElement).toBe(input2);

    // Press backspace on empty input - should move focus to index 1 and select its content
    fireEvent.keyDown(input2, { key: 'Backspace' });

    // Focus should move to previous input
    expect(document.activeElement).toBe(input1);

    // Content should be selected (selectionStart=0, selectionEnd=1 means "2" is selected)
    expect(input1.selectionStart).toBe(0);
    expect(input1.selectionEnd).toBe(1);
  });

  it('fills all digits when pasting a 6-digit code into the first input', () => {
    const onChangeSpy = vi.fn();
    const { container } = render(<HumanPhoneCodeInput value={['', '', '', '', '', '']} onChange={onChangeSpy} />);

    const firstInput = container.querySelector('#human-phone-code-input-0-input')!;

    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => '123456' },
    });

    expect(onChangeSpy).toHaveBeenCalledWith(['1', '2', '3', '4', '5', '6']);
  });

  it('fills remaining digits when pasting from a middle input', () => {
    const onChangeSpy = vi.fn();
    const { container } = render(<HumanPhoneCodeInput value={['1', '2', '', '', '', '']} onChange={onChangeSpy} />);

    const input2 = container.querySelector('#human-phone-code-input-2-input')!;

    fireEvent.paste(input2, {
      clipboardData: { getData: () => '7890' },
    });

    expect(onChangeSpy).toHaveBeenCalledWith(['1', '2', '7', '8', '9', '0']);
  });

  it('strips non-digit characters when pasting', () => {
    const onChangeSpy = vi.fn();
    const { container } = render(<HumanPhoneCodeInput value={['', '', '', '', '', '']} onChange={onChangeSpy} />);

    const firstInput = container.querySelector('#human-phone-code-input-0-input')!;

    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => '12-34-56' },
    });

    expect(onChangeSpy).toHaveBeenCalledWith(['1', '2', '3', '4', '5', '6']);
  });

  it('ignores paste with no digits', () => {
    const onChangeSpy = vi.fn();
    const { container } = render(<HumanPhoneCodeInput value={['', '', '', '', '', '']} onChange={onChangeSpy} />);

    const firstInput = container.querySelector('#human-phone-code-input-0-input')!;

    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => 'abcdef' },
    });

    expect(onChangeSpy).not.toHaveBeenCalled();
  });

  it('truncates pasted code longer than 6 digits', () => {
    const onChangeSpy = vi.fn();
    const { container } = render(<HumanPhoneCodeInput value={['', '', '', '', '', '']} onChange={onChangeSpy} />);

    const firstInput = container.querySelector('#human-phone-code-input-0-input')!;

    fireEvent.paste(firstInput, {
      clipboardData: { getData: () => '12345678' },
    });

    expect(onChangeSpy).toHaveBeenCalledWith(['1', '2', '3', '4', '5', '6']);
  });
});
