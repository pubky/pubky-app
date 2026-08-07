'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Link } from 'lucide-react';
import { SETTINGS_ROUTES } from '@/app/routes';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useLinkConfirmation } from '@/hooks/useLinkConfirmation/useLinkConfirmation';
import { getSafeExternalUrl } from '@/libs/utils/safeExternalUrl';
import { getIconFromUrl } from '@/libs/utils/urlToIcon';
import { DialogCheckLink } from '@/organisms/DialogCheckLink/DialogCheckLink';
import type { ProfilePageLinksProps } from './ProfilePageLinks.types';

export function ProfilePageLinks({ links, isOwnProfile = false }: ProfilePageLinksProps) {
  const router = useRouter();
  const { dialogOpen, setDialogOpen, clickedLink, handleLinkClick } = useLinkConfirmation();
  const handleAddLinkClick = () => {
    router.push(SETTINGS_ROUTES.EDIT);
  };

  // Transform raw links from Nexus into the format we need for rendering
  const transformedLinks = useMemo(
    () =>
      links?.flatMap((link) => {
        const safeUrl = getSafeExternalUrl(link.url);
        if (!safeUrl) return [];

        return {
          icon: getIconFromUrl(safeUrl),
          label: link.title,
          url: safeUrl,
        };
      }) || [],
    [links],
  );
  return (
    <>
      <Container>
        <Heading level={2} size="lg" className="font-light text-muted-foreground">
          {'Links'}
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
              {'No links added yet.'}
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
                {'Add Link'}
              </Typography>
            </Button>
          )}
        </Container>
      </Container>

      <DialogCheckLink open={dialogOpen} onOpenChangeAction={setDialogOpen} linkUrl={clickedLink} />
    </>
  );
}
