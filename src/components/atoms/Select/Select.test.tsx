import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock DOM APIs not available in JSDOM that Radix Select requires
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

// Mock @/libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual };
});

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './Select';

describe('Select', () => {
  it('renders with default props', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
      </Select>,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('data-slot', 'select-trigger');
  });

  it('renders placeholder text', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Pick a fruit" />
        </SelectTrigger>
      </Select>,
    );
    expect(screen.getByText('Pick a fruit')).toBeInTheDocument();
  });

  it('renders trigger with default size', () => {
    render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
      </Select>,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('data-size', 'default');
  });

  it('renders trigger with sm size', () => {
    render(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Select" />
        </SelectTrigger>
      </Select>,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('data-size', 'sm');
  });

  it('renders disabled trigger', () => {
    render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
      </Select>,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeDisabled();
  });

  it('shows content when opened', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('renders select items with correct data-slot', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>,
    );
    const item = document.querySelector('[data-slot="select-item"]');
    expect(item).toBeInTheDocument();
  });

  it('renders select group with label', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Fruits')).toBeInTheDocument();
    const label = document.querySelector('[data-slot="select-label"]');
    expect(label).toBeInTheDocument();
  });

  it('renders separator between groups', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value="carrot">Carrot</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    const separator = document.querySelector('[data-slot="select-separator"]');
    expect(separator).toBeInTheDocument();
  });

  it('displays selected value in trigger when controlled', () => {
    const onValueChange = vi.fn();

    render(
      <Select value="apple" onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );

    // The selected value should be displayed in the trigger
    expect(screen.getByText('Apple')).toBeInTheDocument();
    // Placeholder should not be shown when a value is selected
    expect(screen.queryByText('Select a fruit')).not.toBeInTheDocument();
  });

  it('renders with a default value', () => {
    render(
      <Select defaultValue="banana">
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('renders disabled select item', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple" disabled>
            Apple
          </SelectItem>
        </SelectContent>
      </Select>,
    );
    const item = document.querySelector('[data-slot="select-item"]');
    expect(item).toHaveAttribute('data-disabled');
  });

  it('renders select content with correct data-slot', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
        </SelectContent>
      </Select>,
    );
    const content = document.querySelector('[data-slot="select-content"]');
    expect(content).toBeInTheDocument();
  });
});

describe('Select - Snapshots', () => {
  it('matches snapshot for SelectTrigger with default size', () => {
    const { container } = render(
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
      </Select>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for SelectTrigger with sm size', () => {
    const { container } = render(
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
      </Select>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for SelectTrigger with custom className', () => {
    const { container } = render(
      <Select>
        <SelectTrigger className="custom-trigger-class">
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
      </Select>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled SelectTrigger', () => {
    const { container } = render(
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Select an option" />
        </SelectTrigger>
      </Select>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Select with default value', () => {
    const { container } = render(
      <Select defaultValue="apple">
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for SelectContent with popper position', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    const content = document.querySelector('[data-slot="select-content"]');
    expect(content?.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for SelectContent with item-aligned position', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="item-aligned">
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    const content = document.querySelector('[data-slot="select-content"]');
    expect(content?.parentElement).toMatchSnapshot();
  });

  it('matches snapshot for SelectGroup with SelectLabel', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    const group = document.querySelector('[data-slot="select-group"]');
    expect(group).toMatchSnapshot();
  });

  it('matches snapshot for SelectSeparator', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value="carrot">Carrot</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    const separator = document.querySelector('[data-slot="select-separator"]');
    expect(separator).toMatchSnapshot();
  });

  it('matches snapshot for disabled SelectItem', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple" disabled>
            Apple
          </SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>,
    );
    const disabledItem = document.querySelector('[data-slot="select-item"][data-disabled]');
    expect(disabledItem).toMatchSnapshot();
  });

  it('matches snapshot for SelectItem with custom className', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="apple" className="custom-item-class">
            Apple
          </SelectItem>
        </SelectContent>
      </Select>,
    );
    const item = document.querySelector('[data-slot="select-item"]');
    expect(item).toMatchSnapshot();
  });

  it('matches snapshot for complete select structure', () => {
    render(
      <Select open={true}>
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            <SelectLabel>Fruits</SelectLabel>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="cherry">Cherry</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Vegetables</SelectLabel>
            <SelectItem value="carrot">Carrot</SelectItem>
            <SelectItem value="lettuce" disabled>
              Lettuce
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>,
    );
    const content = document.querySelector('[data-slot="select-content"]');
    expect(content?.parentElement).toMatchSnapshot();
  });
});
