export interface HumanInviteCodeProps {
  onBack: () => void;
  /** Verifies the invite code with the homeserver when the full code is entered. Returns true when valid. */
  onVerify: (inviteCode: string) => Promise<boolean>;
  /** Called when the user clicks Continue after successful verification. */
  onSuccess: (inviteCode: string) => void;
}
