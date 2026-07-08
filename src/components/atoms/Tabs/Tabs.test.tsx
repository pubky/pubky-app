import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tabs, TabsList, TabsTrigger } from './Tabs';

const renderTabs = () =>
  render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </TabsList>
    </Tabs>,
  );

describe('Tabs', () => {
  it('marks the default trigger active', () => {
    renderTabs();
    expect(screen.getByText('Tab A')).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Tab B')).toHaveAttribute('data-state', 'inactive');
  });

  it('activates another trigger on selection', () => {
    renderTabs();
    // Radix Tabs activate on mouseDown (not click) in jsdom.
    fireEvent.mouseDown(screen.getByText('Tab B'));
    expect(screen.getByText('Tab B')).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Tab A')).toHaveAttribute('data-state', 'inactive');
  });

  it('renders triggers with the tab role', () => {
    renderTabs();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });
});
