import { fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { ControlledInputField } from './ControlledInputField';

interface TestFormData {
  testField: string;
}

function TestWrapper({ children }: { children: (form: ReturnType<typeof useForm<TestFormData>>) => React.ReactNode }) {
  const form = useForm<TestFormData>({
    defaultValues: { testField: '' },
  });
  return <>{children(form)}</>;
}

describe('ControlledInputField', () => {
  it('renders with label', () => {
    render(
      <TestWrapper>
        {(form) => (
          <ControlledInputField<TestFormData>
            name="testField"
            control={form.control}
            label="Test Label"
            placeholder="Enter value"
          />
        )}
      </TestWrapper>,
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });

  it('renders with label hint', () => {
    render(
      <TestWrapper>
        {(form) => (
          <ControlledInputField<TestFormData>
            name="testField"
            control={form.control}
            label="Test Label"
            labelHint={<span data-testid="hint">Hint text</span>}
          />
        )}
      </TestWrapper>,
    );

    expect(screen.getByTestId('hint')).toBeInTheDocument();
  });

  it('forwards paste events to the input', () => {
    const handlePaste = vi.fn();

    render(
      <TestWrapper>
        {(form) => (
          <ControlledInputField<TestFormData>
            name="testField"
            control={form.control}
            label="Test Label"
            placeholder="Enter value"
            onPaste={handlePaste}
          />
        )}
      </TestWrapper>,
    );

    fireEvent.paste(screen.getByPlaceholderText('Enter value'), {
      clipboardData: {
        getData: () => 'pasted value',
      },
    });

    expect(handlePaste).toHaveBeenCalled();
  });

  it('forwards icon clicks through an accessible icon button', () => {
    const handleClickIcon = vi.fn();

    render(
      <TestWrapper>
        {(form) => (
          <ControlledInputField<TestFormData>
            name="testField"
            control={form.control}
            placeholder="Enter value"
            icon={<span>icon</span>}
            iconPosition="right"
            onClickIcon={handleClickIcon}
            iconAriaLabel="Icon action"
          />
        )}
      </TestWrapper>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Icon action' }));

    expect(handleClickIcon).toHaveBeenCalledTimes(1);
  });

  it('renders without a label wrapper', () => {
    render(
      <TestWrapper>
        {(form) => (
          <ControlledInputField<TestFormData> name="testField" control={form.control} placeholder="Enter value" />
        )}
      </TestWrapper>,
    );

    expect(screen.queryByText('Test Label')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter value')).toBeInTheDocument();
  });
});

describe('ControlledInputField - Snapshots', () => {
  it('matches snapshot for default state', () => {
    const { container } = render(
      <TestWrapper>
        {(form) => (
          <ControlledInputField<TestFormData>
            name="testField"
            control={form.control}
            label="Test Label"
            placeholder="Enter value"
          />
        )}
      </TestWrapper>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
