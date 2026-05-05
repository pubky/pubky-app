import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileText, LockKeyhole, Users } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarButton } from './SidebarButton';

describe('SidebarButton', () => {
  it('renders with icon and children', () => {
    render(<SidebarButton icon={FileText}>Test Button</SidebarButton>);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Test Button');
  });

  it('renders with different icons', () => {
    const { rerender } = render(<SidebarButton icon={FileText}>File Button</SidebarButton>);
    let button = screen.getByRole('button');
    expect(button.querySelector('svg')).toBeInTheDocument();

    rerender(<SidebarButton icon={LockKeyhole}>Lock Button</SidebarButton>);
    button = screen.getByRole('button');
    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(button).toHaveTextContent('Lock Button');

    rerender(<SidebarButton icon={Users}>Users Button</SidebarButton>);
    button = screen.getByRole('button');
    expect(button.querySelector('svg')).toBeInTheDocument();
    expect(button).toHaveTextContent('Users Button');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(
      <SidebarButton icon={FileText} onClick={handleClick}>
        Click me
      </SidebarButton>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('SidebarButton - Snapshots', () => {
  it('matches snapshot with FileText icon', () => {
    const { container } = render(<SidebarButton icon={FileText}>Terms of service</SidebarButton>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with LockKeyhole icon', () => {
    const { container } = render(<SidebarButton icon={LockKeyhole}>Privacy policy</SidebarButton>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with Users icon', () => {
    const { container } = render(<SidebarButton icon={Users}>See all</SidebarButton>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
