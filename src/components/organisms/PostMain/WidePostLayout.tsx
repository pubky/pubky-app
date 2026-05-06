'use client';

import type { MouseEvent, ReactNode } from 'react';
import { Container } from '@/atoms/Container/Container';

export const WIDE_POST_BODY_TEXT_CLASS = 'text-xl leading-7';

interface WidePostLayoutProps {
  children: ReactNode;
  rightColumn: ReactNode;
  onRightColumnClick?: (event: MouseEvent<HTMLDivElement>) => void;
}

export function WidePostLayout({ children, rightColumn, onRightColumnClick }: WidePostLayoutProps) {
  return (
    <Container className="flex min-w-0 flex-col lg:flex-row">
      <Container className="flex min-w-0 flex-col gap-4 p-12 lg:flex-1">{children}</Container>
      <Container overrideDefaults onClick={onRightColumnClick} className="hidden lg:flex lg:w-96 lg:shrink-0 lg:p-12">
        {rightColumn}
      </Container>
    </Container>
  );
}
