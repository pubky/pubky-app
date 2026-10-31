'use client';

import Image from 'next/image';
import { LucideIcon } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';

interface IllustratedEmptyStateProps {
  imageSrc: string;
  imageAlt: string;
  icon: LucideIcon;
  title: string;
  subtitle: string | React.ReactNode;
  children?: React.ReactNode;
  dataCy?: string;
}

export function IllustratedEmptyState({
  imageSrc,
  imageAlt,
  icon: Icon,
  title,
  subtitle,
  children,
  dataCy,
}: IllustratedEmptyStateProps) {
  return (
    <Container data-cy={dataCy} className="relative flex flex-col items-center justify-center gap-6 p-6">
      {/* Background image. The artwork is drawn for the dark page, so light mode inverts it to keep it a faint relief. */}
      <Image
        src={imageSrc}
        alt={imageAlt}
        fill
        className="pointer-events-none object-contain object-center [.light_&]:invert"
        aria-hidden="true"
      />

      {/* Icon */}
      <Container
        overrideDefaults={true}
        className="relative z-10 flex shrink-0 items-center justify-center rounded-full bg-brand/16 p-6"
      >
        <Icon className="size-12 text-brand" strokeWidth={1.5} />
      </Container>

      {/* Title and subtitle */}
      <Container overrideDefaults={true} className="relative z-10 flex w-full flex-col items-center justify-center">
        <Typography as="h3" size="lg" className="pb-6 text-center leading-8">
          {title}
        </Typography>
        <Typography as="p" className="text-center text-base leading-6 font-medium text-secondary-foreground">
          {subtitle}
        </Typography>
      </Container>

      {/* Optional children content */}
      {children && <Container className="relative z-10 flex items-center justify-center">{children}</Container>}
    </Container>
  );
}
