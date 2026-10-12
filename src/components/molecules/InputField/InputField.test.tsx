import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InputField } from './InputField';

describe('InputField', () => {
  it('renders with default props', () => {
    render(<InputField value="test value" />);

    const input = screen.getByTestId('input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('test value');
  });

  it('handles disabled state', () => {
    render(<InputField value="test" disabled={true} />);

    const input = screen.getByTestId('input');
    expect(input).toBeDisabled();
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<InputField value="test" onClick={handleClick} />);

    const input = screen.getByTestId('input');
    fireEvent.click(input);

    expect(handleClick).toHaveBeenCalled();
  });

  it('renders a clickable icon as an accessible button', () => {
    const handleClickIcon = vi.fn();
    render(
      <InputField
        value="test"
        icon={<span>icon</span>}
        iconPosition="right"
        onClickIcon={handleClickIcon}
        iconAriaLabel="Paste"
        iconClassName="mr-0"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));

    expect(handleClickIcon).toHaveBeenCalledTimes(1);
  });

  it('keeps a clickable icon mounted but inert while loading', () => {
    const handleClickIcon = vi.fn();
    render(
      <InputField
        value="test"
        loading={true}
        icon={<span>icon</span>}
        iconPosition="right"
        onClickIcon={handleClickIcon}
        iconAriaLabel="Paste"
      />,
    );

    const iconButton = screen.getByRole('button', { name: 'Paste' });
    expect(iconButton).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(iconButton);

    expect(handleClickIcon).not.toHaveBeenCalled();
  });

  it('associates the message with the input and announces errors', () => {
    render(<InputField id="url" value="test" message="Enter a valid post URL." messageType="error" status="error" />);

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Enter a valid post URL.');
    expect(screen.getByTestId('input')).toHaveAttribute('aria-describedby', 'url-message');
  });

  it('renders the default variant with a solid border and md size', () => {
    render(<InputField value="test" />);

    const wrapper = screen.getByTestId('input').parentElement;
    expect(wrapper).toHaveClass('border', 'border-input', 'min-h-12', 'text-base');
    expect(wrapper).not.toHaveClass('border-dashed');
  });

  it('renders the dashed variant', () => {
    render(<InputField value="test" variant="dashed" />);
    expect(screen.getByTestId('input').parentElement).toHaveClass('border-dashed');
  });

  it.each([
    ['sm', ['min-h-10', 'text-sm']],
    ['md', ['min-h-12', 'text-base']],
    ['lg', ['min-h-14', 'text-lg']],
  ] as const)('applies size=%s classes', (size, classNames) => {
    render(<InputField value="test" size={size} />);
    expect(screen.getByTestId('input').parentElement).toHaveClass(...classNames);
  });

  it.each([
    ['success', ['border-brand', 'text-brand']],
    ['error', ['border-red-500', 'text-red-500']],
  ] as const)('applies status=%s classes', (status, classNames) => {
    render(<InputField value="test" status={status} />);
    expect(screen.getByTestId('input').parentElement).toHaveClass(...classNames);
    expect(screen.getByTestId('input')).toHaveAttribute('aria-invalid', status === 'error' ? 'true' : 'false');
  });

  it('shows the loading spinner and text while loading', () => {
    render(<InputField value="test" loading />);

    expect(screen.getByTestId('loading-icon')).toBeInTheDocument();
    const input = screen.getByTestId('input');
    expect(input).toHaveValue('Loading...');
    expect(input).toBeDisabled();
    expect(input.parentElement).toHaveClass('border-brand', 'text-brand');
  });

  it('renders a non-clickable icon on the left by default and on the right when requested', () => {
    const { rerender } = render(<InputField value="test" icon={<span data-testid="icon" />} />);

    const input = screen.getByTestId('input');
    expect(input.parentElement).toHaveClass('pl-4.5');
    expect(screen.getByTestId('icon').compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    rerender(<InputField value="test" icon={<span data-testid="icon" />} iconPosition="right" />);
    expect(screen.getByTestId('input').parentElement).toHaveClass('pl-2');
    expect(
      screen.getByTestId('icon').compareDocumentPosition(screen.getByTestId('input')) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it.each([
    ['default', 'text-muted-foreground'],
    ['info', 'text-blue-500'],
    ['alert', 'text-yellow-500'],
    ['error', 'text-red-500'],
    ['success', 'text-brand'],
  ] as const)('styles the message for messageType=%s', (messageType, className) => {
    render(<InputField value="test" message="Hint" messageType={messageType} />);
    expect(screen.getByText('Hint')).toHaveClass(className);
  });

  it('handles paste events', () => {
    const handlePaste = vi.fn();
    render(<InputField value="test" onPaste={handlePaste} />);

    fireEvent.paste(screen.getByTestId('input'), {
      clipboardData: {
        getData: () => 'pasted value',
      },
    });

    expect(handlePaste).toHaveBeenCalled();
  });
});
