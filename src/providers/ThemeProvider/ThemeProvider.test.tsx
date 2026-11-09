import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';

const { providerProps } = vi.hoisted(() => ({ providerProps: vi.fn() }));

vi.mock('next-themes', () => ({
  ThemeProvider: ({ children, ...props }: { children: React.ReactNode }) => {
    providerProps(props);
    return <div data-testid="theme-provider">{children}</div>;
  },
}));

describe('ThemeProvider', () => {
  it('renders children', () => {
    render(
      <ThemeProvider>
        <div>Themed content</div>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('theme-provider')).toBeInTheDocument();
    expect(screen.getByText('Themed content')).toBeInTheDocument();
  });

  it('leaves color-scheme unset so transparent iframes are not given an opaque backdrop', () => {
    render(<ThemeProvider>{null}</ThemeProvider>);

    expect(providerProps).toHaveBeenCalledWith(expect.objectContaining({ enableColorScheme: false }));
  });

  it('passes only the class themes, since enableSystem already appends system', () => {
    render(<ThemeProvider>{null}</ThemeProvider>);

    expect(providerProps).toHaveBeenCalledWith(
      expect.objectContaining({ themes: ['dark', 'light'], enableSystem: true }),
    );
  });
});
