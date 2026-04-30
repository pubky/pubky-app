'use client';

import { useHotTags } from '@/hooks/useHotTags/useHotTags';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Tag as TagIcon } from 'lucide-react';
import * as Atoms from '@/atoms';
import * as Molecules from '@/molecules';
import { APP_ROUTES } from '@/app/routes';
import { MAX_TAGS } from './HotTags.constants';
import type { HotTagsProps } from './HotTags.types';
import { HotTagsSkeleton } from './HotTags.skeleton';

/**
 * HotTags
 *
 * Sidebar section showing trending tags.
 * Fetches tags via useHotTags hook and handles navigation.
 *
 * Note: This is an Organism because it interacts with data hooks (useHotTags)
 * and handles routing.
 */
export function HotTags({ className }: HotTagsProps) {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { tags, isLoading } = useHotTags();
  const displayTags = tags.slice(0, MAX_TAGS);
  const handleTagClick = (tagName: string) => {
    router.push(`${APP_ROUTES.SEARCH}?tags=${encodeURIComponent(tagName)}`);
  };
  const handleSeeAll = () => {
    router.push(APP_ROUTES.HOT);
  };
  return (
    <Molecules.SidebarSection
      title={t('hotTags')}
      footerIcon={TagIcon}
      footerText={tCommon('exploreAll')}
      onFooterClick={handleSeeAll}
      footerTestId="see-all-button"
      className={className}
      data-testid="hot-tags"
      dataCy="hot-tags"
    >
      {isLoading ? (
        <HotTagsSkeleton />
      ) : displayTags.length === 0 ? (
        <Atoms.Typography className="font-light text-muted-foreground">{t('noTags')}</Atoms.Typography>
      ) : (
        <Atoms.Container overrideDefaults className="flex w-full flex-col gap-2" data-cy="hot-tags-list">
          {displayTags.map((tag, index) => (
            <Atoms.Tag
              key={tag.name}
              name={tag.name}
              count={tag.count}
              onClick={handleTagClick}
              data-testid={`tag-${index}`}
            />
          ))}
        </Atoms.Container>
      )}
    </Molecules.SidebarSection>
  );
}
