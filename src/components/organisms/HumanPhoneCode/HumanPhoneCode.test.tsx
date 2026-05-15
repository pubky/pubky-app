import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomegateController } from '@/controllers/homegate/homegate';
import { HumanPhoneCode } from './HumanPhoneCode';

describe('HumanPhoneCode', () => {
  it('on back button click, onBack function is called', () => {
    vi.useFakeTimers();
    try {
      let isBackClicked = false;
      const r = render(
        <HumanPhoneCode
          phoneNumber="1234567890"
          onBack={() => {
            isBackClicked = true;
          }}
          onSuccess={() => {}}
        />,
      );

      // Button is disabled initially (timer > 0)
      const button = r.getByTestId('human-phone-resend-code-btn');
      expect(button).toBeDisabled();

      // Advance timer by 65 seconds in act to ensure React processes state updates
      act(() => {
        vi.advanceTimersByTime(65000);
      });

      // Button should now be enabled (timer should be 0 or less)
      const enabledButton = r.getByTestId('human-phone-resend-code-btn');
      expect(enabledButton).not.toBeDisabled();

      // Click the button
      act(() => {
        fireEvent.click(enabledButton);
      });
      expect(isBackClicked).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('on verify code button click, onVerifyCode function is called', async () => {
    const verifySmsCodeMock = vi
      .spyOn(HomegateController, 'verifySmsCode')
      .mockResolvedValue({ valid: true, signupCode: 'mock-invite-code' });
    let isVerifyCodeClicked = false;
    let inviteCode = '';
    const r = render(
      <HumanPhoneCode
        phoneNumber="1234567890"
        onBack={() => {}}
        onSuccess={(code) => {
          isVerifyCodeClicked = true;
          inviteCode = code;
        }}
      />,
    );

    // No event if there is no code
    fireEvent.click(r.getByTestId('human-phone-send-code-btn'));
    expect(isVerifyCodeClicked).toBe(false);

    // Enter code
    fireEvent.change(r.getByTestId('human-phone-code-input-0-input'), { target: { value: '1' } });
    fireEvent.change(r.getByTestId('human-phone-code-input-1-input'), { target: { value: '2' } });
    fireEvent.change(r.getByTestId('human-phone-code-input-2-input'), { target: { value: '3' } });
    fireEvent.change(r.getByTestId('human-phone-code-input-3-input'), { target: { value: '4' } });
    fireEvent.change(r.getByTestId('human-phone-code-input-4-input'), { target: { value: '5' } });
    fireEvent.change(r.getByTestId('human-phone-code-input-5-input'), { target: { value: '6' } });
    fireEvent.click(r.getByTestId('human-phone-send-code-btn'));

    await waitFor(() => {
      expect(verifySmsCodeMock).toHaveBeenCalledWith({ phoneNumber: '1234567890', code: '123456' });
      expect(isVerifyCodeClicked).toBe(true);
      expect(inviteCode).toBe('mock-invite-code');
    });

    verifySmsCodeMock.mockRestore();
  });

  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneCode phoneNumber="1234567890" onBack={() => {}} onSuccess={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
