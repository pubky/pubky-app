import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SettingsSwitchGroup } from './SettingsSwitchGroup';

describe('SettingsSwitchGroup', () => {
  it('renders with children', () => {
    render(
      <SettingsSwitchGroup>
        <div>Child 1</div>
        <div>Child 2</div>
      </SettingsSwitchGroup>,
    );

    expect(screen.getByText('Child 1')).toBeInTheDocument();
    expect(screen.getByText('Child 2')).toBeInTheDocument();
  });
});
