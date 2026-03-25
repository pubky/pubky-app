import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';

import * as Atoms from '@/atoms';
import { TooltipProvider } from './TooltipProvider';

describe('TooltipProvider', () => {
  it('renders children', () => {
    render(
      <TooltipProvider>
        <span data-testid="child">Hello</span>
      </TooltipProvider>,
    );

    expect(screen.getByTestId('child')).toHaveTextContent('Hello');
  });

  it('enables tooltip functionality for descendants', async () => {
    const user = userEvent.setup();

    render(
      <TooltipProvider>
        <Atoms.Tooltip>
          <Atoms.TooltipTrigger asChild>
            <button type="button">Trigger</button>
          </Atoms.TooltipTrigger>
          <Atoms.TooltipPortal>
            <Atoms.TooltipContent>Tooltip text</Atoms.TooltipContent>
          </Atoms.TooltipPortal>
        </Atoms.Tooltip>
      </TooltipProvider>,
    );

    await user.hover(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('Tooltip text');
    });
  });
});

describe('TooltipProvider - Snapshots', () => {
  it('matches snapshot with children', () => {
    const { container } = render(
      <TooltipProvider>
        <span>Content</span>
      </TooltipProvider>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
