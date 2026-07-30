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

  it('keeps Send Code enabled and hides the error until an invalid send is attempted', async () => {
    const user = userEvent.setup();

    render(<HumanPhoneInput onBack={() => {}} onCodeSent={() => {}} />);

    const input = screen.getByTestId('human-phone-input');
    await user.type(input, '+12345678');

    const sendButton = screen.getByRole('button', { name: /send code/i });
    expect(sendButton).toBeEnabled();
    expect(screen.queryByTestId('human-phone-input-error')).not.toBeInTheDocument();

    await user.click(sendButton);

    expect(HomegateController.sendSmsCode).not.toHaveBeenCalled();
    expect(screen.getByTestId('human-phone-input-error')).toBeInTheDocument();
  });

  it('clears the invalid phone error when the user edits the number', async () => {
    const user = userEvent.setup();

    render(<HumanPhoneInput onBack={() => {}} onCodeSent={() => {}} />);

    const input = screen.getByTestId('human-phone-input');
    await user.type(input, '+12345678');
    await user.click(screen.getByRole('button', { name: /send code/i }));
    expect(screen.getByTestId('human-phone-input-error')).toBeInTheDocument();

    await user.type(input, '9');
    expect(screen.queryByTestId('human-phone-input-error')).not.toBeInTheDocument();
  });
});

describe('HumanPhoneInput - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<HumanPhoneInput onBack={() => {}} onCodeSent={() => {}} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
