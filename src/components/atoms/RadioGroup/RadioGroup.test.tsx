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

  it('renders the description below the label', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="one" label="One" description="First option" />
      </RadioGroup>,
    );

    expect(screen.getByText('First option')).toHaveClass('text-sm', 'text-muted-foreground');
    expect(screen.getByLabelText('One')).toBeInTheDocument();
  });

  it('renders the default variant without a bordered card', () => {
    render(
      <RadioGroup>
        <RadioGroupItem value="one" label="One" />
      </RadioGroup>,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveClass('peer', 'size-4', 'rounded-full', 'border-input');
    expect(radio.closest('.rounded-lg')).toBeNull();
  });

  it('wraps the box variant in a bordered card that reflects the checked state', () => {
    render(
      <RadioGroup defaultValue="one">
        <RadioGroupItem value="one" label="One" description="First option" variant="box" />
        <RadioGroupItem value="two" label="Two" variant="box" />
      </RadioGroup>,
    );

    const box = screen.getByLabelText('One').closest('.rounded-lg');
    expect(box).not.toBeNull();
    expect(box).toHaveClass('border', 'border-border', 'p-4', 'has-[[data-state=checked]]:border-brand');
    expect(box).toContainElement(screen.getByText('First option'));
    expect(screen.getByLabelText('One')).toHaveAttribute('data-state', 'checked');

    fireEvent.click(screen.getByLabelText('Two'));
    expect(screen.getByLabelText('Two')).toHaveAttribute('data-state', 'checked');
    expect(screen.getByLabelText('One')).toHaveAttribute('data-state', 'unchecked');
  });

  it('renders a disabled item that cannot be selected', () => {
    const handleValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={handleValueChange}>
        <RadioGroupItem value="one" label="One" disabled />
      </RadioGroup>,
    );

    const radio = screen.getByLabelText('One');
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute('data-disabled');

    fireEvent.click(radio);
    expect(handleValueChange).not.toHaveBeenCalled();
    expect(radio).toHaveAttribute('aria-checked', 'false');
  });
});
