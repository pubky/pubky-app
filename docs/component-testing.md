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

Always prefer real implementations from concrete `@/libs/*` files for pure functions and business logic:

```typescript
import { formatPublicKey, truncateString } from '@/libs/utils/utils';
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
vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: { ...actual.Logger, error: vi.fn() },
  };
});
```

### Typed Mocks: No `as unknown as T` or `as any`

ESLint bans both `as any` and `as unknown as T` in every `*.test.{ts,tsx}` file (via `no-restricted-syntax` in `eslint.config.mjs`). Both patterns silently switch off TypeScript on the mock and let a bad shape sail through for the lifetime of the test.

Route every cast in a test through a named helper from `src/test-utils` instead. See `src/test-utils/README.md` for the full list, but in short:

| Situation                                                            | Helper                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------- |
| Partial Zustand store double                                         | `mockAuthStore({...})`, `mockHomeStore({...})`, etc.     |
| Partial React synthetic event                                        | `mockKeyboardEvent({...})`, `mockDragEvent({...})`, etc. |
| Partial `@synonymdev/pubky` `Session` / `Keypair`                    | `mockSession({...})` / `mockKeypair({...})`              |
| Partial `fetch` `Response`                                           | `mockResponse({...})`                                    |
| Deliberately invalid input to exercise a runtime guard               | `asInvalid<T>(value)`                                    |
| Opaque external SDK type with no constructor and no dedicated helper | `asOpaque<T>(value)`                                     |

Each helper takes a `Partial<T>` (or a named `T` type parameter) and buries the cast in one place, so the shape of the argument you pass is still type-checked and every remaining escape hatch is greppable.

```typescript
// Before — silently disables the type check on AuthStore and the keyboard event
import type { AuthStore } from '@/stores/auth/auth.types';

const authStore = {
  currentUserPubky: 'abc',
  signIn: vi.fn(),
} as unknown as AuthStore;

const event = { key: 'Enter', preventDefault: vi.fn() } as any;

// After — the helpers type-check the partials and add sensible defaults
import { mockKeyboardEvent } from '@/test-utils/react-events';
import { mockAuthStore } from '@/test-utils/stores';

const authStore = mockAuthStore({
  currentUserPubky: 'abc',
  signIn: vi.fn(),
});

const event = mockKeyboardEvent({ key: 'Enter' });
```

A single-step widening cast like `value as unknown` or `[] as unknown[]` (inside a `vi.hoisted` placeholder, for instance) is still allowed — it widens the type without bypassing any read-side check, so it's not an escape hatch. The rule only fires on the `unknown as T` second hop and on `as any`.

### Icon Components: Always Real

Stock Lucide icons imported from `lucide-react` and custom SVG icons from `@/icons` (`src/libs/icons/icons.tsx`) should **always** use real implementations in tests—do not `vi.mock('lucide-react')` or `vi.mock('@/icons')` to stub icons. This ensures snapshots capture actual SVG output and visual regression tests detect icon changes.

Application import conventions (where to import icons, URL helpers, and what not to do) are documented in **`docs/components.md`** — _Icons (Lucide and custom)_.

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
