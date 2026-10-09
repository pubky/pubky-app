import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

function renderTabs(props: React.ComponentProps<typeof Tabs> = {}) {
  return render(
    <Tabs defaultValue="one" {...props}>
      <TabsList aria-label="Sections">
        <TabsTrigger value="one">One</TabsTrigger>
        <TabsTrigger value="two">Two</TabsTrigger>
      </TabsList>
      <TabsContent value="one">First panel</TabsContent>
      <TabsContent value="two">Second panel</TabsContent>
    </Tabs>,
  );
}

describe('Tabs', () => {
  it('renders a tablist with the default tab selected', () => {
    renderTabs();

    expect(screen.getByRole('tablist', { name: 'Sections' })).toHaveAttribute('data-slot', 'tabs-list');
    expect(screen.getByRole('tab', { name: 'One' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('First panel')).toBeInTheDocument();
    expect(screen.queryByText('Second panel')).not.toBeInTheDocument();
  });

  it('switches the active panel when another tab is clicked', () => {
    renderTabs();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Two' }));

    expect(screen.getByRole('tab', { name: 'Two' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Second panel')).toBeInTheDocument();
    expect(screen.queryByText('First panel')).not.toBeInTheDocument();
  });

  it('reports value changes when controlled', () => {
    const onValueChange = vi.fn();
    renderTabs({ value: 'one', defaultValue: undefined, onValueChange });

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Two' }));

    expect(onValueChange).toHaveBeenCalledWith('two');
    // Controlled: the parent decides, so the panel does not move on its own
    expect(screen.getByText('First panel')).toBeInTheDocument();
  });

  it('keeps an inactive panel mounted when forceMount is set', () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two" forceMount className="data-[state=inactive]:hidden">
          Second panel
        </TabsContent>
      </Tabs>,
    );

    const inactivePanel = screen.getByText('Second panel');
    expect(inactivePanel).toHaveAttribute('data-state', 'inactive');
    expect(inactivePanel).toHaveClass('data-[state=inactive]:hidden');
  });
});

describe('Tabs - Snapshots', () => {
  it('matches snapshot with the first tab active', () => {
    const { container } = renderTabs();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with the second tab active', () => {
    const { container } = renderTabs({ defaultValue: 'two' });
    expect(container.firstChild).toMatchSnapshot();
  });
});
