export type EffectiveTier = 'read-only' | 'assisted' | 'autonomous';

export type EffectiveTierInputs = {
  desired: EffectiveTier;
  sessionCoversPubchi: boolean;
  ceiling: EffectiveTier;
};

const tierOrder: EffectiveTier[] = ['read-only', 'assisted', 'autonomous'];

export function effectiveTier({ desired, sessionCoversPubchi, ceiling }: EffectiveTierInputs): EffectiveTier {
  const sessionTier = sessionCoversPubchi ? desired : 'read-only';
  return tierOrder[Math.min(tierOrder.indexOf(desired), tierOrder.indexOf(ceiling), tierOrder.indexOf(sessionTier))]!;
}

export function effectiveTierReason({
  desired,
  sessionCoversPubchi,
  ceiling,
}: EffectiveTierInputs): string | undefined {
  const effective = effectiveTier({ desired, sessionCoversPubchi, ceiling });
  if (effective === desired) return undefined;
  if (!sessionCoversPubchi) return 'This session lacks Pubchi write access, so Pubchi is currently read-only.';
  return `Your Pubchi is capped at ${ceiling} until the required capability is available.`;
}
