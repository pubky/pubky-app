export interface DialogWelcomeStoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  userBio: string;
  displayPublicKey: string;
  avatarUrl?: string;
  fallbackSeed?: string;
}
