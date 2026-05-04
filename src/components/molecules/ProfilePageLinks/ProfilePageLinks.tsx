'use client';

import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { DialogCheckLink } from '@/organisms/DialogCheckLink/DialogCheckLink';

import { SETTINGS_ROUTES } from '@/app/routes';
import type { ProfilePageLinksProps } from './ProfilePageLinks.types';
import { Link } from 'lucide-react';
import { getIconFromUrl } from '@/libs/utils/urlToIcon';

export function ProfilePageLinks({ links, isOwnProfile = false }: ProfilePageLinksProps) {
  const t = useTranslations('profile.sidebar');
  const router = useRouter();
  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();
  const handleAddLinkClick = () => {
    router.push(SETTINGS_ROUTES.EDIT);
  };

  // Transform raw links from Nexus into the format we need for rendering
  const transformedLinks = useMemo(
    () =>
      links?.map((link) => ({
        icon: getIconFromUrl(link.url),
        label: link.title,
        url: link.url,
      })) || [],
    [links],
  );
  return (
    <>
      <Container>
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {t('links')}
        </Heading>

        <Container>
          {transformedLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <a
                key={index}
                href={link.url}
                data-cy={`profile-link-${link.label.toLowerCase()}`}
                onClick={(e) => handleLinkClick(link.url, e)}
                className="flex cursor-pointer items-center gap-2.5 py-1"
              >
                <Icon size={16} className="shrink-0 text-foreground" />
                <Typography as="span" className="flex-1 text-base font-medium text-secondary-foreground">
                  {link.label}
                </Typography>
              </a>
            );
          })}
          {transformedLinks.length === 0 && (
            <Typography as="span" className="text-base font-medium text-muted-foreground">
              {t('noLinks')}
            </Typography>
          )}

          {isOwnProfile && (
            <Button
              data-cy="profile-add-link-btn"
              variant="outline"
              size="sm"
              className="mt-2 border border-border bg-foreground/5"
              onClick={handleAddLinkClick}
            >
              <Link size={16} className="text-foreground" />
              <Typography as="span" className="text-sm font-bold">
                {t('addLink')}
              </Typography>
            </Button>
          )}
        </Container>
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
}
