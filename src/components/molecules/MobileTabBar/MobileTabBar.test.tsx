import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StickyNote, Tag, UsersRound } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { MobileTabBar } from './MobileTabBar';
import type { MobileTabBarItem } from './MobileTabBar.types';

const makeItems = (overrides: Partial<Record<string, Partial<MobileTabBarItem>>> = {}): MobileTabBarItem[] => {
  const base: MobileTabBarItem[] = [
    {
      key: 'tags',
      icon: Tag,
      label: 'Tags',
      isActive: true,
      onSelect: vi.fn(),
    },
    {
      key: 'users',
      icon: UsersRound,
      label: 'Users',
      isActive: false,
      onSelect: vi.fn(),
    },
    {
      key: 'posts',
      icon: StickyNote,
      label: 'Posts',
      isActive: false,
      onSelect: vi.fn(),
    },
  ];
  return base.map((item) => ({ ...item, ...(overrides[item.key] ?? {}) }));
};

describe('MobileTabBar', () => {
  it('renders all items', () => {
    render(<MobileTabBar items={makeItems()} />);
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    expect(screen.getByLabelText('Users')).toBeInTheDocument();
    expect(screen.getByLabelText('Posts')).toBeInTheDocument();
  });

  it('renders correct number of buttons', () => {
    const { container } = render(<MobileTabBar items={makeItems()} />);
    expect(container.querySelectorAll('button')).toHaveLength(3);
  });

  it('does not render label text in icon-only mode', () => {
    render(<MobileTabBar items={makeItems()} />);
    expect(screen.queryByText('Tags')).not.toBeInTheDocument();
    expect(screen.queryByText('Users')).not.toBeInTheDocument();
  });

  it('renders label text when showLabels is true', () => {
    render(<MobileTabBar items={makeItems()} showLabels />);
    expect(screen.getByText('Tags')).toBeInTheDocument();
    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
  });

  it('applies active color to both icon and label when showLabels is true', () => {
    render(<MobileTabBar items={makeItems()} showLabels />);
    const activeLabel = screen.getByText('Tags');
    expect(activeLabel).toHaveClass('text-foreground');
    const inactiveLabel = screen.getByText('Users');
    expect(inactiveLabel).toHaveClass('text-muted-foreground');
  });

  it('applies sticky positioning by default', () => {
    const { container } = render(<MobileTabBar items={makeItems()} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('sticky', 'top-(--header-height-mobile)');
    expect(root).not.toHaveClass('fixed');
  });

  it('applies fixed positioning when requested', () => {
    const { container } = render(<MobileTabBar items={makeItems()} position="fixed" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('fixed', 'top-(--header-height-mobile)', 'right-0', 'left-0');
    expect(root).not.toHaveClass('sticky');
  });

  it('uses compact header top offset when headerTop is compact', () => {
    const { container } = render(<MobileTabBar items={makeItems()} position="fixed" headerTop="compact" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('top-(--header-height-settings)');
    expect(root).not.toHaveClass('top-(--header-height-mobile)');
  });

  it('always applies shared root classes', () => {
    const { container } = render(<MobileTabBar items={makeItems()} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('mobile-menu-gradient-fade', 'bg-background', 'lg:hidden', 'z-(--z-mobile-menu)');
  });

  it('marks active item with border-foreground, icon text-foreground, and aria-current', () => {
    const { container } = render(<MobileTabBar items={makeItems()} />);
    const activeButton = container.querySelector('button[aria-current="page"]');
    expect(activeButton).toBeInTheDocument();
    expect(activeButton).toHaveAttribute('aria-label', 'Tags');

    const cells = container.querySelectorAll('div[class*="border-b"]');
    expect(cells[0]).toHaveClass('border-foreground');
    expect(cells[1]).toHaveClass('border-border');
    expect(cells[2]).toHaveClass('border-border');

    const icons = container.querySelectorAll('svg');
    expect(icons[0]).toHaveClass('text-foreground');
    expect(icons[1]).toHaveClass('text-muted-foreground');
    expect(icons[2]).toHaveClass('text-muted-foreground');
  });

  it('does not set aria-current on inactive items', () => {
    const { container } = render(<MobileTabBar items={makeItems()} />);
    const inactiveButtons = container.querySelectorAll('button:not([aria-current])');
    expect(inactiveButtons).toHaveLength(2);
  });

  it('calls onSelect when clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const items = makeItems({ users: { onSelect } });

    render(<MobileTabBar items={items} />);
    await user.click(screen.getByLabelText('Users'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('defaults aria-label to label', () => {
    render(<MobileTabBar items={makeItems()} />);
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
  });

  it('uses ariaLabel override when provided', () => {
    const items = makeItems({ tags: { ariaLabel: 'Custom Tags Label' } });
    render(<MobileTabBar items={items} />);
    expect(screen.getByLabelText('Custom Tags Label')).toBeInTheDocument();
    expect(screen.queryByLabelText('Tags')).not.toBeInTheDocument();
  });

  it('merges className onto the root', () => {
    const { container } = render(<MobileTabBar items={makeItems()} className="-mx-6 mb-6" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('-mx-6', 'mb-6');
  });

  it('passes through data-testid', () => {
    const { container } = render(<MobileTabBar items={makeItems()} data-testid="my-tab-bar" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveAttribute('data-testid', 'my-tab-bar');
  });

  it('forwards a ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    render(<MobileTabBar ref={ref} items={makeItems()} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.tagName).toBe('DIV');
  });

  it('applies flex items-center gap-2 to button only when showLabels is true', () => {
    const { container: iconOnly } = render(<MobileTabBar items={makeItems()} />);
    iconOnly.querySelectorAll('button').forEach((btn) => {
      expect(btn).toHaveClass('px-2.5', 'py-2');
      expect(btn).not.toHaveClass('flex', 'items-center', 'gap-2');
    });

    const { container: withLabels } = render(<MobileTabBar items={makeItems()} showLabels />);
    withLabels.querySelectorAll('button').forEach((btn) => {
      expect(btn).toHaveClass('px-2.5', 'py-2', 'flex', 'items-center', 'gap-2');
    });
  });
});

describe('MobileTabBar - Snapshots', () => {
  it('matches snapshot for icon-only sticky (default)', () => {
    const { container } = render(<MobileTabBar items={makeItems()} data-testid="mobile-tab-bar" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for showLabels + sticky', () => {
    const { container } = render(<MobileTabBar items={makeItems()} showLabels data-testid="mobile-tab-bar" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
