import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, Trash } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/atoms/DropdownMenu/DropdownMenu';
import { MENU_VARIANT } from '@/config/ui';
import { PostMenuActionList, type PostMenuActionListItem } from './PostMenuActionList';

const items = (): PostMenuActionListItem[] => [
  { id: 'copy-link', label: 'Copy link', icon: Link, onClick: vi.fn() },
  { id: 'delete', label: 'Delete', icon: Trash, onClick: vi.fn(), variant: 'destructive', disabled: true },
];

describe('PostMenuActionList', () => {
  it('renders sheet rows as ghost buttons in the muted or destructive colour', () => {
    render(<PostMenuActionList items={items()} variant={MENU_VARIANT.SHEET} onActionComplete={vi.fn()} />);

    const copy = screen.getByRole('button', { name: 'Copy link' });
    expect(copy).toHaveAttribute('data-cy', 'post-menu-action-copy-link');
    expect(copy).toHaveAttribute('data-variant', 'ghost');
    expect(screen.getByText('Copy link')).toHaveClass('text-muted-foreground');
    expect(screen.getByText('Delete')).toHaveClass('text-destructive');
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('renders dropdown rows as menu items with the given data-cy prefix', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <PostMenuActionList
            items={items()}
            variant={MENU_VARIANT.DROPDOWN}
            onActionComplete={vi.fn()}
            dataCyPrefix="resource-menu-action"
          />
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const rows = screen.getAllByRole('menuitem');
    expect(rows.map((row) => row.getAttribute('data-cy'))).toEqual([
      'resource-menu-action-copy-link',
      'resource-menu-action-delete',
    ]);
    expect(screen.getByText('Copy link')).toHaveClass('text-muted-foreground', 'group-hover:text-foreground');
    expect(rows[1]).toHaveAttribute('data-disabled');
  });

  it('runs the item’s action, then reports it done', async () => {
    const list = items();
    const onActionComplete = vi.fn();
    render(<PostMenuActionList items={list} variant={MENU_VARIANT.SHEET} onActionComplete={onActionComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));

    await waitFor(() => expect(onActionComplete).toHaveBeenCalledTimes(1));
    expect(list[0].onClick).toHaveBeenCalledTimes(1);
  });
});
