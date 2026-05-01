import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimelineStateWrapper } from './TimelineStateWrapper';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('../TimelineLoading', () => ({
  TimelineLoading: () => <div data-testid="default-loading">Default Loading...</div>,
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <span {...props}>{children}</span>
    ),
  };
});

describe('TimelineStateWrapper', () => {
  const mockChildren = <div data-testid="mock-children">Children Content</div>;

  describe('Loading State', () => {
    it('should render default loading component when loading', () => {
      render(
        <TimelineStateWrapper loading={true} error={null} hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('default-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-children')).not.toBeInTheDocument();
    });

    it('should render custom loading component when provided', () => {
      const customLoading = <div data-testid="custom-loading">Custom Loading</div>;

      render(
        <TimelineStateWrapper loading={true} error={null} hasItems={false} loadingComponent={customLoading}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
      expect(screen.queryByTestId('default-loading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-children')).not.toBeInTheDocument();
    });

    it('should prioritize loading state over error state', () => {
      render(
        <TimelineStateWrapper loading={true} error="Some error" hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('default-loading')).toBeInTheDocument();
      expect(screen.queryByText(/some error/i)).not.toBeInTheDocument();
    });

    it('should prioritize loading state over empty state', () => {
      render(
        <TimelineStateWrapper loading={true} error={null} hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('default-loading')).toBeInTheDocument();
      expect(screen.queryByText('noPosts')).not.toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('should render default error when error and no items', () => {
      render(
        <TimelineStateWrapper loading={false} error="Network error" hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByText(/network error/i)).toBeInTheDocument();
      expect(screen.queryByTestId('mock-children')).not.toBeInTheDocument();
    });

    it('should render custom error component when provided', () => {
      const customError = <div data-testid="custom-error">Custom Error</div>;

      render(
        <TimelineStateWrapper loading={false} error="Some error" hasItems={false} errorComponent={customError}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('custom-error')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-children')).not.toBeInTheDocument();
    });

    it('should render children when error but has items', () => {
      render(
        <TimelineStateWrapper loading={false} error="Some error" hasItems={true}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('mock-children')).toBeInTheDocument();
    });

    it('should prioritize error state over empty state', () => {
      render(
        <TimelineStateWrapper loading={false} error="Some error" hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByText(/some error/i)).toBeInTheDocument();
      expect(screen.queryByText('noPosts')).not.toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should render default empty when no items', () => {
      render(
        <TimelineStateWrapper loading={false} error={null} hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByText('noPosts')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-children')).not.toBeInTheDocument();
    });

    it('should render custom empty component when provided', () => {
      const customEmpty = <div data-testid="custom-empty">Custom Empty</div>;

      render(
        <TimelineStateWrapper loading={false} error={null} hasItems={false} emptyComponent={customEmpty}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
      expect(screen.queryByText('noPosts')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-children')).not.toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should render children when has items', () => {
      render(
        <TimelineStateWrapper loading={false} error={null} hasItems={true}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('mock-children')).toBeInTheDocument();
      expect(screen.queryByTestId('default-loading')).not.toBeInTheDocument();
      expect(screen.queryByText('noPosts')).not.toBeInTheDocument();
    });

    it('should render children when has items even with error', () => {
      render(
        <TimelineStateWrapper loading={false} error="Some error" hasItems={true}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('mock-children')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle null error correctly', () => {
      render(
        <TimelineStateWrapper loading={false} error={null} hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByText('noPosts')).toBeInTheDocument();
    });

    it('should handle empty string error', () => {
      render(
        <TimelineStateWrapper loading={false} error="" hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(screen.getByText('noPosts')).toBeInTheDocument();
    });

    it('should handle multiple children', () => {
      render(
        <TimelineStateWrapper loading={false} error={null} hasItems={true}>
          <div data-testid="child-1">Child 1</div>
          <div data-testid="child-2">Child 2</div>
          <div data-testid="child-3">Child 3</div>
        </TimelineStateWrapper>,
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
      expect(screen.getByTestId('child-3')).toBeInTheDocument();
    });
  });

  describe('Snapshots', () => {
    it('should match snapshot for loading state', () => {
      const { container } = render(
        <TimelineStateWrapper loading={true} error={null} hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot for error state', () => {
      const { container } = render(
        <TimelineStateWrapper loading={false} error="Network error" hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot for empty state', () => {
      const { container } = render(
        <TimelineStateWrapper loading={false} error={null} hasItems={false}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot for success state', () => {
      const { container } = render(
        <TimelineStateWrapper loading={false} error={null} hasItems={true}>
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot with custom components', () => {
      const customLoading = <div>Custom Loading</div>;
      const customError = <div>Custom Error</div>;
      const customEmpty = <div>Custom Empty</div>;

      const { container } = render(
        <TimelineStateWrapper
          loading={false}
          error={null}
          hasItems={false}
          loadingComponent={customLoading}
          errorComponent={customError}
          emptyComponent={customEmpty}
        >
          {mockChildren}
        </TimelineStateWrapper>,
      );

      expect(container).toMatchSnapshot();
    });
  });
});
