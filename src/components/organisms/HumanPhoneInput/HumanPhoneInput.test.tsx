import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomegateController } from '@/controllers/homegate/homegate';
import { HumanPhoneInput } from './HumanPhoneInput';

vi.mock('@/controllers/homegate/homegate', () => ({
  HomegateController: {
    sendSmsCode: vi.fn(),
  },
}));

describe('HumanPhoneInput', () => {
  beforeEach(() => {
    vi.mocked(HomegateController.sendSmsCode).mockReset();
    vi.mocked(HomegateController.sendSmsCode).mockResolvedValue({ success: true });
  });

  it('enables Send Code for Argentina numbers missing trunk 9 and sends normalized E.164', async () => {
    const user = userEvent.setup();
    const onCodeSent = vi.fn();

    render(<HumanPhoneInput onBack={() => {}} onCodeSent={onCodeSent} />);

    const input = screen.getByTestId('human-phone-input');
    await user.type(input, '+543416620881');

    const sendButton = screen.getByRole('button', { name: /send code/i });
    expect(sendButton).toBeEnabled();

    await user.click(sendButton);

    await waitFor(() => {
      expect(HomegateController.sendSmsCode).toHaveBeenCalledWith('+5493416620881');
    });
    expect(onCodeSent).toHaveBeenCalledWith('+5493416620881');
  });

  it('shows an invalid phone error for non-valid numbers once enough digits are entered', async () => {
    const user = userEvent.setup();

    render(<HumanPhoneInput onBack={() => {}} onCodeSent={() => {}} />);

    const input = screen.getByTestId('human-phone-input');
    await user.type(input, '+12345678');

    expect(screen.getByTestId('human-phone-input-error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send code/i })).toBeDisabled();
  });
});

describe('HumanPhoneInput - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneInput onBack={() => {}} onCodeSent={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
