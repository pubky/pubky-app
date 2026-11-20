import {
  Atom,
  Bitcoin,
  BookOpen,
  Briefcase,
  CalendarDays,
  Code,
  CookingPot,
  Database,
  Dna,
  FileText,
  Film,
  FlaskConical,
  Gamepad2,
  Globe,
  GraduationCap,
  Image as ImageIcon,
  Leaf,
  type LucideIcon,
  Mail,
  MapPin,
  MessageSquare,
  Music,
  Package,
  Podcast,
  Scale,
  User,
  Users,
  Zap,
} from 'lucide-react';
import type { TPinakesCard } from '@/services/pinakes/pinakes.types';
import { getNearestTypes } from './ResourceCard.utils';

/**
 * The icon that stands for a schema.org type, nearest ancestor wins (`CafeOrCoffeeShop` →
 * `Place`): what a card without an image shows in the image's place.
 */
const TYPE_ICONS: Readonly<Record<string, LucideIcon>> = {
  MusicRecording: Music,
  MusicAlbum: Music,
  MusicGroup: Music,
  MusicEvent: Music,
  Person: User,
  Event: CalendarDays,
  Place: MapPin,
  Movie: Film,
  TVSeries: Film,
  VideoObject: Film,
  PodcastSeries: Podcast,
  PodcastEpisode: Podcast,
  Book: BookOpen,
  SoftwareSourceCode: Code,
  SoftwareApplication: Code,
  WebApplication: Code,
  VideoGame: Gamepad2,
  Product: Package,
  Dataset: Database,
  DataFeed: CalendarDays,
  Legislation: Scale,
  JobPosting: Briefcase,
  Recipe: CookingPot,
  Organization: Users,
  BitcoinBlock: Bitcoin,
  BitcoinTransaction: Bitcoin,
  BitcoinAddress: Bitcoin,
  LightningNode: Zap,
  LightningChannel: Zap,
  Taxon: Leaf,
  Observation: Leaf,
  Protein: Dna,
  MolecularEntity: Atom,
  MedicalTrial: FlaskConical,
  LearningResource: GraduationCap,
  Conversation: MessageSquare,
  DiscussionForumPosting: MessageSquare,
  SocialMediaPosting: MessageSquare,
  EmailMessage: Mail,
  VisualArtwork: ImageIcon,
  ImageObject: ImageIcon,
  CreativeWork: FileText,
};

/** The card's type icon, from its `type` and then `type_path` from the deepest; a globe for any other. */
export function getResourceTypeIcon(card: Pick<TPinakesCard, 'type' | 'type_path'>): LucideIcon {
  for (const type of getNearestTypes(card)) {
    const icon = TYPE_ICONS[type];
    if (icon) return icon;
  }
  return Globe;
}
