import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useThreadTreeContext } from './ThreadTreeContext';
import { ThreadTreeProvider } from './ThreadTreeProvider';

// Test consumer component
function TestConsumer() {
  const { allLevel2Expanded, toggleAllLevel2 } = useThreadTreeContext();
  return (
    <div>
      <span data-testid="expanded-state">{String(allLevel2Expanded)}</span>
      <button data-testid="toggle-btn" onClick={toggleAllLevel2}>
        Toggle
      </button>
    </div>
  );
}

describe('ThreadTreeContext', () => {
  it('provides allLevel2Expanded as false by default', () => {
    render(
      <ThreadTreeProvider>
        <TestConsumer />
      </ThreadTreeProvider>,
    );

    expect(screen.getByTestId('expanded-state')).toHaveTextContent('false');
  });

  it('toggles allLevel2Expanded when toggleAllLevel2 is called', () => {
    render(
      <ThreadTreeProvider>
        <TestConsumer />
      </ThreadTreeProvider>,
    );

    expect(screen.getByTestId('expanded-state')).toHaveTextContent('false');

    fireEvent.click(screen.getByTestId('toggle-btn'));
    expect(screen.getByTestId('expanded-state')).toHaveTextContent('true');

    fireEvent.click(screen.getByTestId('toggle-btn'));
    expect(screen.getByTestId('expanded-state')).toHaveTextContent('false');
  });

  it('throws when useThreadTreeContext is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useThreadTreeContext must be used within a ThreadTreeProvider');

    consoleSpy.mockRestore();
  });
});
