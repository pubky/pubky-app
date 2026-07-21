import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ancestor } from '@/hooks/usePostAncestors/usePostAncestors.types';
import { PostPageBreadcrumb } from './PostPageBreadcrumb';

describe('PostPageBreadcrumb', () => {
  const mockOnNavigate = vi.fn();

  const createAncestors = (count: number): Ancestor[] => {
    return Array.from({ length: count }, (_, i) => ({
      postId: `user${i + 1}:post${i + 1}`,
      userId: `user${i + 1}`,
    }));
  };

  const createUserDetailsMap = (count: number): Map<string, string> => {
    const map = new Map<string, string>();
    const names = ['John', 'Satoshi', 'Anna', 'Alice', 'Bob', 'Charlie'];
    for (let i = 0; i < count; i++) {
      map.set(`user${i + 1}`, names[i] || `User${i + 1}`);
    }
    return map;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Sanity test
  it('renders without errors', () => {
    const ancestors = createAncestors(2);
    const userDetailsMap = createUserDetailsMap(2);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    expect(screen.getByTestId('post-breadcrumb')).toBeInTheDocument();
  });

  // Functional tests
  it('renders all items when count <= 3', () => {
    const ancestors = createAncestors(3);
    const userDetailsMap = createUserDetailsMap(3);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Satoshi')).toBeInTheDocument();
    expect(screen.getByText('Anna')).toBeInTheDocument();
    // No ellipsis trigger should be present
    expect(screen.queryByTestId('breadcrumb-ellipsis-trigger')).not.toBeInTheDocument();
  });

  it('truncates when count > 3', () => {
    const ancestors = createAncestors(5);
    const userDetailsMap = createUserDetailsMap(5);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    // First item visible
    expect(screen.getByText('John')).toBeInTheDocument();
    // Last two items visible
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    // Middle items (Satoshi, Anna) should be hidden in dropdown
    expect(screen.queryByText('Satoshi')).not.toBeInTheDocument();
    expect(screen.queryByText('Anna')).not.toBeInTheDocument();
    // Ellipsis trigger should be present
    expect(screen.getByTestId('breadcrumb-ellipsis-trigger')).toBeInTheDocument();
  });

  it('shows dropdown trigger when truncated', () => {
    const ancestors = createAncestors(5);
    const userDetailsMap = createUserDetailsMap(5);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    // Dropdown trigger (ellipsis) should be present
    const ellipsisTrigger = screen.getByTestId('breadcrumb-ellipsis-trigger');
    expect(ellipsisTrigger).toBeInTheDocument();
    expect(ellipsisTrigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('calls onNavigate when non-current item is clicked', () => {
    const ancestors = createAncestors(3);
    const userDetailsMap = createUserDetailsMap(3);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    // Click on first item (John) which is not current
    const johnItem = screen.getByText('John').closest('button');
    fireEvent.click(johnItem!);

    expect(mockOnNavigate).toHaveBeenCalledWith('user1:post1');
  });

  it('does not call onNavigate when current (last) item is clicked', () => {
    const ancestors = createAncestors(3);
    const userDetailsMap = createUserDetailsMap(3);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    // Click on last item (Anna) which is current
    const annaItem = screen.getByText('Anna').closest('button');
    fireEvent.click(annaItem!);

    expect(mockOnNavigate).not.toHaveBeenCalled();
  });

  it('calls onNavigate when visible (last two) items are clicked in truncated state', () => {
    const ancestors = createAncestors(5);
    const userDetailsMap = createUserDetailsMap(5);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    // Click on Alice (second-to-last, visible in truncated state)
    const aliceItem = screen.getByText('Alice').closest('button');
    fireEvent.click(aliceItem!);

    expect(mockOnNavigate).toHaveBeenCalledWith('user4:post4');
  });

  it('shows "Unknown" for user with missing name', () => {
    const ancestors = createAncestors(2);
    // Only add name for user2, not user1
    const userDetailsMap = new Map<string, string>();
    userDetailsMap.set('user2', 'Satoshi');

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByText('Satoshi')).toBeInTheDocument();
  });

  it('constrains breadcrumb items so long usernames can truncate', () => {
    const longName = 'This is an extremely long profile name that should truncate in the breadcrumb trail';
    const ancestors = createAncestors(3);
    const userDetailsMap = createUserDetailsMap(3);
    userDetailsMap.set('user3', longName);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    const breadcrumb = screen.getByTestId('post-breadcrumb');
    expect(breadcrumb).toHaveClass('w-full', 'min-w-0');
    expect(breadcrumb.querySelector('ol')).toHaveClass('justify-end');

    const lastItem = screen.getByTestId('breadcrumb-item-2');
    expect(lastItem).toHaveClass('min-w-0', 'max-w-[50%]', 'shrink-0', 'overflow-hidden');
    expect(within(lastItem).getByText(longName)).toHaveClass('truncate', 'max-w-full');
  });

  it('keeps the last breadcrumb visible when earlier items are long', () => {
    const longName = 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz';
    const ancestors = createAncestors(3);
    const userDetailsMap = createUserDetailsMap(3);
    userDetailsMap.set('user1', longName);
    userDetailsMap.set('user2', longName);

    render(<PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />);

    expect(screen.getByTestId('breadcrumb-item-0')).toHaveClass('shrink');
    expect(screen.getByTestId('breadcrumb-item-1')).toHaveClass('shrink');
    expect(screen.getByTestId('breadcrumb-item-2')).toHaveClass('shrink-0');
    expect(screen.getByText('Anna')).toBeInTheDocument();
  });
});

describe('PostPageBreadcrumb - Snapshots', () => {
  const mockOnNavigate = vi.fn();

  const createAncestors = (count: number): Ancestor[] => {
    return Array.from({ length: count }, (_, i) => ({
      postId: `user${i + 1}:post${i + 1}`,
      userId: `user${i + 1}`,
    }));
  };

  const createUserDetailsMap = (count: number): Map<string, string> => {
    const map = new Map<string, string>();
    const names = ['John', 'Satoshi', 'Anna', 'Alice', 'Bob', 'Charlie'];
    for (let i = 0; i < count; i++) {
      map.set(`user${i + 1}`, names[i] || `User${i + 1}`);
    }
    return map;
  };

  it('matches snapshot for non-truncated state (2 items)', () => {
    const ancestors = createAncestors(2);
    const userDetailsMap = createUserDetailsMap(2);

    const { container } = render(
      <PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />,
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for non-truncated state (3 items)', () => {
    const ancestors = createAncestors(3);
    const userDetailsMap = createUserDetailsMap(3);

    const { container } = render(
      <PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />,
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for truncated state (5 items)', () => {
    const ancestors = createAncestors(5);
    const userDetailsMap = createUserDetailsMap(5);

    const { container } = render(
      <PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />,
    );

    expect(container).toMatchSnapshot();
  });

  it('matches snapshot for truncated state (6 items)', () => {
    const ancestors = createAncestors(6);
    const userDetailsMap = createUserDetailsMap(6);

    const { container } = render(
      <PostPageBreadcrumb ancestors={ancestors} userDetailsMap={userDetailsMap} onNavigate={mockOnNavigate} />,
    );

    expect(container).toMatchSnapshot();
  });
});
