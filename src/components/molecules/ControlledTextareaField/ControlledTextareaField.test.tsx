import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { ControlledTextareaField } from './ControlledTextareaField';

interface TestFormData {
  testField: string;
}

function TestWrapper({ children }: { children: (form: ReturnType<typeof useForm<TestFormData>>) => React.ReactNode }) {
  const form = useForm<TestFormData>({
    defaultValues: { testField: '' },
  });
  return <>{children(form)}</>;
}

describe('ControlledTextareaField', () => {
  it('renders with label', () => {
    render(
      <TestWrapper>
        {(form) => (
          <ControlledTextareaField<TestFormData>
            name="testField"
            control={form.control}
            label="Test Label"
            placeholder="Enter text"
          />
        )}
      </TestWrapper>,
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter text')).toBeInTheDocument();
  });

  it('renders with custom rows', () => {
    render(
      <TestWrapper>
        {(form) => (
          <ControlledTextareaField<TestFormData> name="testField" control={form.control} label="Test Label" rows={6} />
        )}
      </TestWrapper>,
    );

    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveAttribute('rows', '6');
  });
});

describe('ControlledTextareaField - Snapshots', () => {
  it('matches snapshot for default state', () => {
    const { container } = render(
      <TestWrapper>
        {(form) => (
          <ControlledTextareaField<TestFormData>
            name="testField"
            control={form.control}
            label="Test Label"
            placeholder="Enter text"
          />
        )}
      </TestWrapper>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
