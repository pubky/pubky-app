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

### Mobile Snapshot Tests

Add mobile-viewport snapshot tests for **organism** and **template** components when viewport-aware JavaScript can change the rendered HTML. This includes:

- **Direct** `useIsMobile` usage in the component (or `useFeedLayoutResolution`, which uses `useIsMobile` internally).
- **Indirect** usage: the component renders a child (molecule or organism) that calls `useIsMobile` — e.g. `ProfilePageHeader` → `StatusPickerWrapper`, `PostHeader` → `PostHeaderTimestamp`, `ClickableTagsList` → `PostTagPopoverWrapper`.

Do not add mobile snapshots for components whose responsive behaviour is CSS-only (`lg:hidden`, etc.) — those produce identical HTML to desktop and add noise without coverage value.

Atoms and molecules do not require mobile snapshots.

#### Organisation

Mobile snapshot tests live in a separate describe block using the pattern `ComponentName - Mobile Snapshots`, placed after the desktop `ComponentName - Snapshots` block:

```typescript
describe('PostMenuActions - Mobile Snapshots', () => {
  // Mobile snapshot tests here
});
```

#### Viewport helper

Use `setMobileViewport()` and `resetViewport()` from `@/test-utils/viewport`. These resize the jsdom window so viewport-aware hooks (e.g. `useIsMobile`, which reads `window.innerWidth`) render their mobile layout.

The mobile viewport is **390×844** (iPhone 12 Pro), matching `cypress/cypress.config.mobile.ts`. jsdom defaults to 1024×768, so desktop snapshots capture the desktop layout without any extra setup.

#### `beforeEach` and `afterEach`

Call `setMobileViewport()` in `beforeEach` **before** rendering, and `resetViewport()` in `afterEach` so later tests in the file are not left on a mobile-sized window.

If the test file mocks `useIsMobile`, also set the mock to return `true` in the mobile `beforeEach`. Resizing the window alone has no effect when the hook is stubbed — the mobile snapshot would otherwise match desktop and miss JS-driven layout branches (e.g. `Sheet` instead of `Popover`).

If the test file mocks `useFeedLayoutResolution`, set `isPhoneViewport: true` in the mobile `beforeEach` alongside `setMobileViewport()`.

#### Indirect `useIsMobile` via children

When an organism or template renders a child that calls `useIsMobile`, it needs mobile snapshot coverage even if the parent never imports the hook.

**Do not stub those children in snapshot tests.** A passthrough mock (e.g. `PostTagPopoverWrapper: ({ children }) => children`) hides the mobile/desktop branch. Use the real child implementation in snapshot tests, or `vi.importActual` for that module, and mock only its non-viewport dependencies (data hooks, router, etc.).

If the child calls `useIsMobile` and the test file does not mock the hook at the parent level, `setMobileViewport()` drives the real hook inside the child. If the hook is mocked anywhere in the file, set `mockReturnValue(true)` in the mobile `beforeEach` so the child receives the mobile branch too.

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';

const mockUseIsMobile = vi.fn(() => false);

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: () => mockUseIsMobile(),
}));

describe('PostMenuActions - Mobile Snapshots', () => {
  beforeEach(() => {
    // Replicate any mock-state setup from the desktop snapshot describe (if present)
    mockUseIsMobile.mockReturnValue(true); // required when useIsMobile is mocked
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(<PostMenuActions postId="pk:test123:post456" trigger={<button>Menu</button>} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
```

**Replicate mock setup from the desktop snapshot describe.** If the `ComponentName - Snapshots` block has a `beforeEach` that resets hooks, stores, or module-level mock state, copy that setup into the mobile `beforeEach` before `mockUseIsMobile.mockReturnValue(true)` and `setMobileViewport()`. A mobile snapshot test must use the same render call (component, props, wrappers, or in-file render helpers) as the first desktop snapshot test.

**Nested describe blocks.** If the desktop snapshot describe is nested inside a parent `describe` whose `beforeEach` sets up mocks (e.g. `usePostNavigation`), the mobile describe may sit outside that parent — in that case, include those mock setups explicitly in the mobile `beforeEach`.

#### Coverage

Add **one** mobile snapshot per covered component, mirroring the first (simplest) desktop snapshot. Do not duplicate every desktop variant on mobile.

When the hook is unmocked, `setMobileViewport()` drives the real `useIsMobile` implementation. When the test file mocks `useIsMobile`, also call `mockReturnValue(true)` in the mobile `beforeEach` — resizing the window alone has no effect on a stubbed hook.

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

| Situation                                                            | Helper                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Partial Zustand store double                                         | `mockAuthStore({...})`, `mockHomeStore({...})`, etc.                   |
| Partial React synthetic event                                        | `mockKeyboardEvent({...})`, `mockDragEvent({...})`, etc.               |
| Partial `@synonymdev/pubky` `Session` / `Keypair`                    | `mockSession({...})` / `mockKeypair({...})`                            |
| Partial `fetch` `Response`                                           | `mockResponse({...})`                                                  |
| Deliberately invalid input to exercise a runtime guard               | `asInvalid<T>(value)`                                                  |
| Opaque external SDK type with no constructor and no dedicated helper | `asOpaque<T>(value)`                                                   |
| Mobile viewport for organism/template snapshot tests                 | `setMobileViewport()` / `resetViewport()` from `@/test-utils/viewport` |

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
npm run test:snapshots               # Only snapshot tests (desktop and mobile)
npm run test:update-snapshots        # Update snapshots
npx vitest run -t "Mobile Snapshots" # Only mobile snapshot tests
```

## Testing Workflow

1. Run tests after creating new test files
2. When adding new snapshot tests, update snapshots with `-u`
3. New organism or template components that use `useIsMobile` directly or indirectly (see [Mobile Snapshot Tests](#mobile-snapshot-tests)): add both desktop (`ComponentName - Snapshots`) and mobile (`ComponentName - Mobile Snapshots`) snapshot coverage
4. Verify all tests pass before committing
5. Review generated snapshot files to ensure they capture expected output

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

`Button` is an atom — desktop snapshots only. Organisms and templates with direct or indirect `useIsMobile` (or `useFeedLayoutResolution`) additionally require a `ComponentName - Mobile Snapshots` block; see [Mobile Snapshot Tests](#mobile-snapshot-tests).
