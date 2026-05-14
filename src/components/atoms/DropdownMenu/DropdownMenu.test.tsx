import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './DropdownMenu';

describe('DropdownMenu', () => {
  it('renders with default props', () => {
    render(<DropdownMenu>Default DropdownMenu</DropdownMenu>);
    const dropdown = screen.getByText('Default DropdownMenu');
    expect(dropdown).toBeInTheDocument();
  });

  it('shows content when trigger is clicked', async () => {
    const user = userEvent.setup();
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Open Menu</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const trigger = screen.getByRole('button');
    await user.click(trigger);

    // Content should appear after click - wait for it to appear
    await waitFor(() => {
      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });
  });
});

describe('DropdownMenu - Snapshots', () => {
  it('matches snapshot for DropdownMenuTrigger with default props', () => {
    const { container } = render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
      </DropdownMenu>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for DropdownMenuTrigger with asChild', () => {
    const { container } = render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Open Menu</button>
        </DropdownMenuTrigger>
      </DropdownMenu>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for dropdown menu in open state', () => {
    const { container } = render(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger asChild>
          <button>Open Menu</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuItem>Item 2</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
