import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
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
