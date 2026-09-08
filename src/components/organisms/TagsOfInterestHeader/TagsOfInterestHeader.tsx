import { PageHeader } from '@/atoms/PageHeader/PageHeader';
import { PageSubtitle } from '@/atoms/PageSubtitle/PageSubtitle';
import { PageTitle } from '@/molecules/Page/Page';

export const TagsOfInterestHeader = () => {
  return (
    <PageHeader>
      <PageTitle size="large">
        {/* Space lives inside the span: a trailing space on the text node would end up
            as trailing whitespace in snapshot files and trip `git diff --check`. */}
        {'Tags of'}
        <span className="text-brand">{' interest.'}</span>
      </PageTitle>
      <PageSubtitle>{'Select topics to get suggestions on who to follow.'}</PageSubtitle>
    </PageHeader>
  );
};
