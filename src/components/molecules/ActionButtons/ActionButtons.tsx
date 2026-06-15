'use client';

import { BookOpen, Eye, UserRoundPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { cn } from '@/libs/utils/utils';

interface ActionButtonsProps {
  className?: React.HTMLAttributes<HTMLDivElement>['className'];
  onLearn?: () => void;
  onCreateAccount?: () => void;
  onExplore?: () => void;
}

export function ActionButtons({ className, onLearn, onCreateAccount, onExplore, ...props }: ActionButtonsProps) {
  const t = useTranslations('landing');

  return (
    <Container className={cn('gap-3 sm:flex-row sm:items-center', className)} {...props}>
      {onLearn && (
        <Button
          id="learn-btn"
          data-cy="learn-btn"
          variant="secondary"
          className="sm:w-auto"
          size="lg"
          onClick={onLearn}
        >
          <BookOpen className="h-4 w-4" />
          {t('learn')}
        </Button>
      )}
      {onExplore && (
        <Button
          id="explore-btn"
          data-cy="explore-btn"
          variant="secondary"
          className="sm:w-auto"
          size="lg"
          onClick={onExplore}
        >
          <Eye className="h-4 w-4" />
          {t('explore')}
        </Button>
      )}
      <Button id="create-account-btn" variant="brand" className="px-10 sm:w-auto" size="lg" onClick={onCreateAccount}>
        <UserRoundPlus className="h-4 w-4" />
        {t('join')}
      </Button>
    </Container>
  );
}
