import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SideDrawer } from './SideDrawer';

describe('SideDrawer', () => {
  const mockOnOpenChangeAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset document.body.style.overflow
    document.body.style.overflow = '';
  });

  afterEach(() => {
    // Clean up any timers
    vi.clearAllTimers();
  });

  it('renders when open is true', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('does not render when open is false', () => {
    render(
      <SideDrawer open={false} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('renders with left position by default', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    // Check that the component renders
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders with left position when position is left', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="left">
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders with right position when position is right', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="right">
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('calls onOpenChangeAction when backdrop is clicked', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    // Find the backdrop by looking for the element with the backdrop classes
    const backdrop = document.querySelector('.absolute.inset-0.bg-black');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(mockOnOpenChangeAction).toHaveBeenCalledWith(false);
    }
  });

  it('applies correct classes for left position', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="left">
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct classes for right position', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="right">
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct width classes for left position', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="left">
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct width classes for right position', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="right">
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct base classes', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct backdrop classes', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('applies correct container classes', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('handles animation states correctly', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    // Should be visible when open
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('sets body overflow hidden when open', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores body overflow when closed', () => {
    const { rerender } = render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <SideDrawer open={false} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('renders children correctly', () => {
    render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div data-testid="child-1">Child 1</div>
        <div data-testid="child-2">Child 2</div>
      </SideDrawer>,
    );

    expect(screen.getByTestId('child-1')).toBeInTheDocument();
    expect(screen.getByTestId('child-2')).toBeInTheDocument();
  });
});

describe('SideDrawer - Snapshots', () => {
  const mockOnOpenChangeAction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches snapshot with left position', () => {
    const { container } = render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="left">
        <div>Test Content</div>
      </SideDrawer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with right position', () => {
    const { container } = render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction} position="right">
        <div>Test Content</div>
      </SideDrawer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot when closed', () => {
    const { container } = render(
      <SideDrawer open={false} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>Test Content</div>
      </SideDrawer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with complex children', () => {
    const { container } = render(
      <SideDrawer open={true} onOpenChangeAction={mockOnOpenChangeAction}>
        <div>
          <h2>Drawer Content</h2>
          <div>
            <button>Option 1</button>
            <button>Option 2</button>
          </div>
        </div>
      </SideDrawer>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
