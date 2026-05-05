import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from './Tooltip';

describe('Tooltip', () => {
  it('renders tooltip content when open', () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button type="button">Hover me</button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Tooltip body</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByRole('tooltip')).toHaveTextContent('Tooltip body');
  });
});

describe('Tooltip - Snapshots', () => {
  it('matches snapshot when open with trigger and content', () => {
    const { container } = render(
      <TooltipProvider delayDuration={0}>
        <Tooltip open>
          <TooltipTrigger asChild>
            <button type="button">Trigger</button>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Snapshot label</TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(container.firstChild).toMatchSnapshot();
    expect(screen.getByRole('tooltip')).toMatchSnapshot();
  });
});
