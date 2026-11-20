import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostPageLayout } from './PostPageLayout';

const mocks = vi.hoisted(() => ({ ContentLayout: vi.fn() }));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children, ...props }: { children: ReactNode; rightSidebarContent?: ReactNode }) => {
    mocks.ContentLayout(props);
    return (
      <div data-testid="content-layout">
        {props.rightSidebarContent}
        {children}
      </div>
    );
  },
}));
vi.mock('@/organisms/SinglePostLeftSidebar/SinglePostLeftSidebar', () => ({
  SinglePostLeftSidebar: () => <div data-testid="single-post-left-sidebar" />,
  SinglePostLeftDrawer: () => <div data-testid="single-post-left-drawer" />,
  SinglePostLeftDrawerMobile: () => <div data-testid="single-post-left-drawer-mobile" />,
}));

describe('PostPageLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gives the page the post filters on the left and its own cards on the right', () => {
    render(
      <PostPageLayout
        rightSidebarContent={<div data-testid="panel" />}
        rightDrawerContent={<div data-testid="drawer" />}
      >
        <div data-testid="body" />
      </PostPageLayout>,
    );

    expect(screen.getByTestId('body')).toBeInTheDocument();
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    const props = mocks.ContentLayout.mock.lastCall![0];
    expect(props.classNameWrapperContent).toBe('gap-0');
    render(<>{props.leftSidebarContent}</>);
    expect(screen.getByTestId('single-post-left-sidebar')).toBeInTheDocument();
    render(<>{props.leftDrawerContent}</>);
    expect(screen.getByTestId('single-post-left-drawer')).toBeInTheDocument();
    render(<>{props.leftDrawerContentMobile}</>);
    expect(screen.getByTestId('single-post-left-drawer-mobile')).toBeInTheDocument();
    expect(props.showRightMobileButton).toBe(true);
  });

  it('passes a page’s mobile drawer button and grid classes on', () => {
    render(
      <PostPageLayout
        rightSidebarContent={<div />}
        rightDrawerContent={null}
        showRightMobileButton={false}
        className="pb-44"
      >
        <div />
      </PostPageLayout>,
    );

    expect(mocks.ContentLayout).toHaveBeenLastCalledWith(
      expect.objectContaining({ rightDrawerContent: null, showRightMobileButton: false, className: 'pb-44' }),
    );
  });
});
