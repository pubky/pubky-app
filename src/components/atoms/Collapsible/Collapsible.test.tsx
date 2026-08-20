import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './Collapsible';

function Example({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger>Toggle</CollapsibleTrigger>
      <CollapsibleContent>
        <span>Hidden content</span>
      </CollapsibleContent>
    </Collapsible>
  );
}

describe('Collapsible', () => {
  it('keeps content out of the tree while closed', () => {
    render(<Example />);

    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('renders content when opened by default', () => {
    render(<Example defaultOpen />);

    expect(screen.getByText('Hidden content')).toBeInTheDocument();
  });

  it('unmounts content on close rather than only hiding it', async () => {
    // Consumers rely on this: children that fetch on mount must not fetch while collapsed.
    render(<Example defaultOpen />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('toggles content and the trigger state on click', async () => {
    render(<Example />);

    const trigger = screen.getByRole('button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Hidden content')).toBeInTheDocument();
  });

  it('points the trigger at the content it controls', async () => {
    render(<Example defaultOpen />);

    const trigger = screen.getByRole('button');
    const controlledId = trigger.getAttribute('aria-controls');

    expect(controlledId).toBeTruthy();
    expect(screen.getByTestId('collapsible-content')).toHaveAttribute('id', controlledId);
  });

  it('exposes slot hooks on every part', () => {
    render(<Example defaultOpen />);

    expect(screen.getByTestId('collapsible')).toHaveAttribute('data-slot', 'collapsible');
    expect(screen.getByTestId('collapsible-trigger')).toHaveAttribute('data-slot', 'collapsible-trigger');
    expect(screen.getByTestId('collapsible-content')).toHaveAttribute('data-slot', 'collapsible-content');
  });

  it('forwards className to the content', () => {
    render(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Toggle</CollapsibleTrigger>
        <CollapsibleContent className="custom-content">Body</CollapsibleContent>
      </Collapsible>,
    );

    expect(screen.getByTestId('collapsible-content')).toHaveClass('custom-content');
  });
});

describe('Collapsible - Snapshots', () => {
  it('matches snapshot when closed', () => {
    const { container } = render(<Example />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when open', () => {
    const { container } = render(<Example defaultOpen />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
