/** Outcome of invite code verification from the parent (maps homeserver responses). */
export type InviteCodeVerificationResult = 'valid' | 'invalid' | 'used' | 'error';

export interface HumanInviteCodeProps {
  onBack: () => void;
  /** Verifies the invite code with the homeserver when the full code is entered. */
  onVerify: (inviteCode: string) => Promise<InviteCodeVerificationResult>;
  /** Called when the user clicks Continue after successful verification. */
  onSuccess: (inviteCode: string) => void;
}
