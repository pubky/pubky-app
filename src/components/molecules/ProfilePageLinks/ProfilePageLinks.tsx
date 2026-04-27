'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import * as Hooks from '@/hooks';
import { SETTINGS_ROUTES } from '@/app/routes';
import type { ProfilePageLinksProps } from './ProfilePageLinks.types';
import { Link } from 'lucide-react';
import { getIconFromUrl } from '@/libs/utils/urlToIcon';
export function ProfilePageLinks({ links, isOwnProfile = false }: ProfilePageLinksProps) {
  const t = useTranslations('profile.sidebar');
  const router = useRouter();
  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = Hooks.useLinkConfirmation();
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
      <Atoms.Container>
        <Atoms.Heading level={2} size="lg" className="font-light text-muted-foreground">
          {t('links')}
        </Atoms.Heading>

        <Atoms.Container>
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
                <Atoms.Typography as="span" className="flex-1 text-base font-medium text-secondary-foreground">
                  {link.label}
                </Atoms.Typography>
              </a>
            );
          })}
          {transformedLinks.length === 0 && (
            <Atoms.Typography as="span" className="text-base font-medium text-muted-foreground">
              {t('noLinks')}
            </Atoms.Typography>
          )}

          {isOwnProfile && (
            <Atoms.Button
              data-cy="profile-add-link-btn"
              variant="outline"
              size="sm"
              className="mt-2 border border-border bg-foreground/5"
              onClick={handleAddLinkClick}
            >
              <Link size={16} className="text-foreground" />
              <Atoms.Typography as="span" className="text-sm font-bold">
                {t('addLink')}
              </Atoms.Typography>
            </Atoms.Button>
          )}
        </Atoms.Container>
      </Atoms.Container>

      <Organisms.DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
}
