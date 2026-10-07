import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RadioGroup, RadioGroupItem } from './RadioGroup';

const renderRadioGroup = (props?: { onValueChange?: (value: string) => void; defaultValue?: string }) =>
  render(
    <RadioGroup {...props}>
      <RadioGroupItem value="one" label="One" />
      <RadioGroupItem value="two" label="Two" />
    </RadioGroup>,
  );

describe('RadioGroup', () => {
  it('renders two radios', () => {
    renderRadioGroup();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('selects an item when clicked and reports the value', () => {
    const handleValueChange = vi.fn();
    renderRadioGroup({ onValueChange: handleValueChange });

    fireEvent.click(screen.getByLabelText('Two'));

    expect(handleValueChange).toHaveBeenCalledWith('two');
    expect(screen.getByLabelText('Two')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('One')).toHaveAttribute('aria-checked', 'false');
  });

  it('enforces mutual exclusivity', () => {
    renderRadioGroup({ defaultValue: 'one' });

    expect(screen.getByLabelText('One')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Two')).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(screen.getByLabelText('Two'));

    expect(screen.getByLabelText('One')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByLabelText('Two')).toHaveAttribute('aria-checked', 'true');
  });

  it('clicking the label selects the radio', () => {
    const handleValueChange = vi.fn();
    renderRadioGroup({ onValueChange: handleValueChange });

    fireEvent.click(screen.getByText('One'));

    expect(handleValueChange).toHaveBeenCalledWith('one');
  });

  it('renders a standalone item without label/description', () => {
    render(
      <RadioGroup defaultValue="solo">
        <RadioGroupItem value="solo" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radio')).toBeInTheDocument();
  });
});
