# Component Testing

Rules and patterns for unit tests and snapshot tests for UI components.

## File Naming

Each UI component should have a corresponding test file in the same directory.
Example: `Button.tsx` → `Button.test.tsx`

## Unit Test Structure

### Sanity Tests

Add at least one sanity test to confirm UI renders with expected elements and attributes:

```typescript
it('renders with default props', () => {
  render(<Button>Default Button</Button>);
  const button = screen.getByRole('button');
  expect(button).toBeInTheDocument();
  expect(button).toHaveAttribute('data-slot', 'button');
});
```

### Functional Tests

Test interactive behavior like click handlers and hover states:

```typescript
it('handles click events', () => {
  const handleClick = vi.fn();
  render(<Button onClick={handleClick}>Click me</Button>);
  fireEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});

it('handles hover states correctly', () => {
  render(<Button variant="default">Hover Button</Button>);
  const button = screen.getByRole('button');
  expect(button).toHaveClass('hover:!bg-brand/30');
});
```

## Snapshot Test Structure

### Organization

All snapshot tests should be in a separate describe block using the pattern `ComponentName - Snapshots`:

```typescript
describe('Button - Snapshots', () => {
  // All snapshot tests here
});
```

### Coverage

Create snapshot tests for all meaningful prop combinations — sizes, variants, and states:

```typescript
it('matches snapshot for small size', () => {
  const { container } = render(<Button size="sm">Small</Button>);
  expect(container.firstChild).toMatchSnapshot();
});
```

### Snapshot Rules

**Max one expect per snapshot test.** Each snapshot test should contain exactly one `expect().toMatchSnapshot()` call.

**Never render the exact same element for multiple snapshot tests.** Vary props, children, or state to ensure each snapshot is unique.

## Test Optimization

- Unit tests should focus on functional behavior and logic
- Snapshot tests should focus on visual/structure differences
- Avoid checking the same attributes in both unit and snapshot tests
- Exception: overlapping checks are acceptable for the single sanity test

## Mocking Rules

### Default: Use Real Implementations

Always prefer real implementations from `@/libs` for pure functions and business logic:

```typescript
import { formatDate, validateEmail } from '@/libs/utils';
// No mocking needed for pure functions
```

### When to Mock

Mock only for:

1. **External API calls** — prevent actual network requests
2. **File system operations** — avoid touching the file system
3. **Database connections** — avoid actual DB connections in component tests
4. **Time/Randomness** — use `vi.useFakeTimers()` for deterministic tests
5. **Error conditions** — simulate error scenarios

### Selective Mocking

```typescript
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Logger: { ...actual.Logger, error: vi.fn() },
  };
});
```

### Icon Components: Always Real

Icon components from `@/libs/icons` should **always** use real implementations. This ensures snapshots capture actual SVG rendering and visual regression tests detect icon changes.

### Radix UI Components: Always Real

Radix UI components (`Dialog`, `Sheet`, `DropdownMenu`, `Popover`, `Tooltip`, `Accordion`) should **never** be mocked. This ensures:

- Tests validate actual behavior and context requirements
- Portal rendering works correctly
- Accessibility attributes are properly applied

### Radix UI ID Normalization

A global snapshot serializer in `src/config/test.ts` automatically normalizes Radix dynamic IDs (`radix-_r_0_`, etc.) to `radix-normalized`. No manual intervention is required.

## Deterministic Time Testing

Components displaying relative time (e.g., "2 hours ago") must use fake timers:

```typescript
describe('PostTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays relative time correctly', () => {
    const twoHoursAgo = new Date('2024-01-01T10:00:00Z');
    render(<PostTimestamp createdAt={twoHoursAgo} />);
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });
});
```

## Snapshot File Location

Snapshot files are stored in `__snapshots__/` directories alongside test files:

```
src/components/atoms/Button/
├── Button.test.tsx
└── __snapshots__/
    └── Button.test.tsx.snap
```

## Running Tests

```bash
npm test                             # All tests
npm test -- ComponentName.test.tsx   # Specific component
npm run test:snapshots               # Only snapshot tests
npm run test:update-snapshots        # Update snapshots
```

## Testing Workflow

1. Run tests after creating new test files
2. When adding new snapshot tests, update snapshots with `-u`
3. Verify all tests pass before committing
4. Review generated snapshot files to ensure they capture expected output

## Complete Example

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with default props', () => {
    render(<Button>Default Button</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('data-slot', 'button');
  });

  it('handles click events', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('Button - Snapshots', () => {
  it('matches snapshot for small size', () => {
    const { container } = render(<Button size="sm">Small</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for large size', () => {
    const { container } = render(<Button size="lg">Large</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for secondary variant', () => {
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for disabled state', () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    expect(container.firstChild).toMatchSnapshot();
  });
});
```
