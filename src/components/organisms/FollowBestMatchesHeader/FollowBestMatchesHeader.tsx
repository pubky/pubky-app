import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { PageTitle } from '@/molecules/Page/Page';

export const FollowBestMatchesHeader = () => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {/* Space lives inside the span: a trailing space on the text node would end up
            as trailing whitespace in snapshot files and trip `git diff --check`. */}
        {'Follow'}
        <span className="text-brand">{' your best matches.'}</span>
      </PageTitle>
      <PageSubtitle>{'Add people you like to build your feed.'}</PageSubtitle>
    </PageHeader>
  );
};
