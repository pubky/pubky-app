import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageContainer, PageTitle } from './Page';

describe('Page Components - Snapshots', () => {
  describe('PageContainer - Snapshots', () => {
    it('matches snapshot for default PageContainer', () => {
      const { container } = render(
        <PageContainer>
          <div>Test content</div>
        </PageContainer>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot for PageContainer with different configurations', () => {
      const { container } = render(
        <PageContainer as="main" size="narrow" className="custom-page">
          <p>Main content</p>
        </PageContainer>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('PageTitle - Snapshots', () => {
    it('matches snapshot for default PageTitle', () => {
      const { container } = render(<PageTitle>Default Title</PageTitle>);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches snapshot for PageTitle with different configurations', () => {
      const { container } = render(
        <PageTitle size="medium" className="custom-title">
          Medium Title
        </PageTitle>,
      );
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
