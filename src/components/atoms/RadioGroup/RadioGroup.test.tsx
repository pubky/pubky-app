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

describe('RadioGroup - Snapshots', () => {
  it('matches snapshot for default group with labels', () => {
    const { container } = render(
      <RadioGroup defaultValue="one">
        <RadioGroupItem value="one" label="One" />
        <RadioGroupItem value="two" label="Two" />
      </RadioGroup>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for item with label and description', () => {
    const { container } = render(
      <RadioGroup defaultValue="one">
        <RadioGroupItem value="one" label="One" description="The first option" />
      </RadioGroup>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for box variant', () => {
    const { container } = render(
      <RadioGroup defaultValue="starter">
        <RadioGroupItem value="starter" label="Starter Plan" description="Perfect for small businesses" variant="box" />
        <RadioGroupItem value="pro" label="Pro Plan" description="Advanced features" variant="box" />
      </RadioGroup>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled item', () => {
    const { container } = render(
      <RadioGroup>
        <RadioGroupItem value="one" label="One" disabled />
      </RadioGroup>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
