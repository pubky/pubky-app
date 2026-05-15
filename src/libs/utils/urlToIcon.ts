import {
  Facebook,
  GitFork,
  Github,
  Gitlab,
  Instagram,
  Link,
  Linkedin,
  type LucideProps,
  Mail,
  MessageCircle,
  MessageSquare,
  Music,
  Phone,
  Slack,
  Twitch,
  Video,
  Youtube,
} from 'lucide-react';
import { Telegram, XTwitter } from '@/icons';

/**
 * Maps a URL to the appropriate icon component based on the domain.
 *
 * @param url - The URL to parse and extract the domain from
 * @returns A Lucide icon component
 *
 * @example
 * ```ts
 * const icon = getIconFromUrl('https://github.com/user/repo');
 * // Returns Github
 *
 * const defaultIcon = getIconFromUrl('https://example.com');
 * // Returns Link (default)
 * ```
 */
export function getIconFromUrl(url: string): React.ComponentType<LucideProps> {
  try {
    // Parse the URL to extract the hostname
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Remove 'www.' prefix if present
    const domain = hostname.replace(/^www\./, '');

    // Map domains to their respective icons
    const domainIconMap: Record<string, React.ComponentType<LucideProps>> = {
      // Social Media
      'github.com': Github,
      'x.com': XTwitter,
      'twitter.com': XTwitter,
      'youtube.com': Youtube,
      'youtu.be': Youtube,
      'facebook.com': Facebook,
      'fb.com': Facebook,
      'instagram.com': Instagram,
      'linkedin.com': Linkedin,
      'reddit.com': MessageSquare, // Lucide doesn't have Reddit
      'twitch.tv': Twitch,
      'discord.com': MessageSquare, // Lucide doesn't have Discord
      'discord.gg': MessageSquare,

      // Messaging
      'telegram.org': Telegram,
      't.me': Telegram,
      'telegram.me': Telegram,
      'web.telegram.org': Telegram,
      'slack.com': Slack,
      'whatsapp.com': MessageSquare,
      'signal.org': MessageSquare,

      // Communication
      'gmail.com': Mail,
      'outlook.com': Mail,
      'mail.google.com': Mail,

      // Development
      'gitlab.com': Gitlab,
      'bitbucket.org': GitFork,
      'stackoverflow.com': MessageCircle,
      'stackexchange.com': MessageCircle,

      // Video/Streaming
      'vimeo.com': Video,
      'dailymotion.com': Video,
      'tiktok.com': Video,

      // Music
      'spotify.com': Music,
      'soundcloud.com': Music,
      'music.apple.com': Music,
      'music.youtube.com': Music,

      // Generic patterns
      // Email pattern (if it starts with mailto:)
      ...(url.startsWith('mailto:') ? { _email: Mail } : {}),
      // Phone pattern (if it starts with tel:)
      ...(url.startsWith('tel:') ? { _phone: Phone } : {}),
    };

    // Check for exact domain match
    if (domainIconMap[domain]) {
      return domainIconMap[domain];
    }

    // Check for subdomain matches (e.g., blog.example.com should match example.com)
    for (const [key, icon] of Object.entries(domainIconMap)) {
      if (domain.endsWith('.' + key)) {
        return icon;
      }
    }

    // Special URL patterns
    if (url.startsWith('mailto:')) {
      return Mail;
    }
    if (url.startsWith('tel:')) {
      return Phone;
    }

    // Default to Link icon
    return Link;
  } catch {
    // If URL parsing fails, return default Link icon
    return Link;
  }
}

/**
 * Extracts a clean label from a URL for display purposes.
 *
 * @param url - The URL to extract the label from
 * @returns A clean string label suitable for display
 *
 * @example
 * ```ts
 * getLabelFromUrl('https://github.com/user/repo');
 * // Returns 'github.com/user/repo'
 *
 * getLabelFromUrl('https://www.example.com');
 * // Returns 'example.com'
 * ```
 */
export function getLabelFromUrl(url: string): string {
  try {
    // Handle special URL schemes
    if (url.startsWith('mailto:')) {
      return url.replace('mailto:', '');
    }
    if (url.startsWith('tel:')) {
      return url.replace('tel:', '');
    }

    const urlObj = new URL(url);
    let label = urlObj.hostname.replace(/^www\./, '');

    // Add path if it's meaningful (not just '/')
    if (urlObj.pathname && urlObj.pathname !== '/') {
      label += urlObj.pathname;
    }

    return label;
  } catch {
    // If URL parsing fails, return the original URL
    return url;
  }
}
