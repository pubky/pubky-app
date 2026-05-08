'use client';

import * as React from 'react';
import { Container } from '@/atoms/Container/Container';
import { HeaderSocialLinks } from '../Header/Header';
import { HeaderButtonSignIn } from '../HeaderButtonSignIn/HeaderButtonSignIn';

export const HeaderHome = ({ ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <Container className="flex-1 flex-row items-center justify-end" {...props}>
      <HeaderSocialLinks />
      <HeaderButtonSignIn />
    </Container>
  );
};
