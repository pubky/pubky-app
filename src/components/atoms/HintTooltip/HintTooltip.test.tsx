import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '../Tooltip/Tooltip';
import { HintTooltip } from './HintTooltip';

const render = (ui: ReactElement) => rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);

describe('HintTooltip', () => {
  it('renders the child alone without a hint', () => {
    const { container } = render(
      <HintTooltip>
        <span className="count">12</span>
      </HintTooltip>,
    );

    expect(container.innerHTML).toBe('<span class="count">12</span>');
  });

  it('keeps the child in place and shows the hint on hover', async () => {
    const user = userEvent.setup();
    render(
      <HintTooltip hint="In your network">
        <span className="count">12</span>
      </HintTooltip>,
    );

    const count = screen.getByText('12');
    expect(count.tagName).toBe('SPAN');
    expect(count).toHaveClass('count');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.hover(count);

    await waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent('In your network');
    });
  });
});
