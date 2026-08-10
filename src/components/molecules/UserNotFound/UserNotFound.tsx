'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Tag, UserX } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

/**
 * UserNotFound - Empty state component for when a user profile is not found
 *
 * Displayed when navigating to a profile URL with a pubky that doesn't exist.
 */
export function UserNotFound() {
  const router = useRouter();

  return (
    <IllustratedEmptyState
      imageSrc="/images/connections-empty-state.webp"
      imageAlt={'User Not Found'}
      icon={UserX}
      title={'User Not Found'}
      subtitle={"The user you're looking for doesn't exist or may have been removed."}
    >
      <Container overrideDefaults className="flex flex-col items-center justify-center gap-6 sm:flex-row">
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={() => router.push(APP_ROUTES.HOME)}>
          <ArrowLeft className="size-4 shrink-0" />
          {'Back to Feed'}
        </Button>
        <Button type="button" variant={ButtonVariant.SECONDARY} onClick={() => router.push(APP_ROUTES.HOT)}>
          <Tag className="size-4 shrink-0" />
          {'Explore Tags'}
        </Button>
      </Container>
    </IllustratedEmptyState>
  );
}
