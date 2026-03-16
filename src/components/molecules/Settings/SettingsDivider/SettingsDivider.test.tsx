import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SettingsDivider } from './SettingsDivider';

describe('SettingsDivider', () => {
  it('renders correctly', () => {
    const { container } = render(<SettingsDivider />);
    const divider = container.firstChild as HTMLElement;

    expect(divider).toBeInTheDocument();
    expect(divider).toHaveClass('h-px', 'w-full', 'bg-border');
    expect(divider).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SettingsDivider - Snapshots', () => {
  it('matches snapshot', () => {
    const { container } = render(<SettingsDivider />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
