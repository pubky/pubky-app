export interface HumanInviteCodeProps {
  onBack: () => void;
  /** Called when user submits invite code. May be async; throws on validation failure. */
  onSuccess: (inviteCode: string) => void | Promise<void>;
}
