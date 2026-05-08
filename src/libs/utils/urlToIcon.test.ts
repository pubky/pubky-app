import {
  Facebook,
  Github,
  Gitlab,
  Instagram,
  Link,
  Linkedin,
  Mail,
  Music,
  Phone,
  Slack,
  Twitch,
  Youtube,
} from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Telegram, XTwitter } from '@/icons';
import { getIconFromUrl, getLabelFromUrl } from './urlToIcon';

describe('getIconFromUrl', () => {
  describe('Social Media', () => {
    it('should return Github icon for github.com', () => {
      const icon = getIconFromUrl('https://github.com/user/repo');
      expect(icon).toBe(Github);
    });

    it('should return XTwitter icon for x.com', () => {
      const icon = getIconFromUrl('https://x.com/user');
      expect(icon).toBe(XTwitter);
    });

    it('should return XTwitter icon for twitter.com', () => {
      const icon = getIconFromUrl('https://twitter.com/user');
      expect(icon).toBe(XTwitter);
    });

    it('should return Youtube icon for youtube.com', () => {
      const icon = getIconFromUrl('https://youtube.com/watch?v=123');
      expect(icon).toBe(Youtube);
    });

    it('should return Youtube icon for youtu.be', () => {
      const icon = getIconFromUrl('https://youtu.be/123');
      expect(icon).toBe(Youtube);
    });

    it('should return Facebook icon for facebook.com', () => {
      const icon = getIconFromUrl('https://facebook.com/user');
      expect(icon).toBe(Facebook);
    });

    it('should return Instagram icon for instagram.com', () => {
      const icon = getIconFromUrl('https://instagram.com/user');
      expect(icon).toBe(Instagram);
    });

    it('should return Linkedin icon for linkedin.com', () => {
      const icon = getIconFromUrl('https://linkedin.com/in/user');
      expect(icon).toBe(Linkedin);
    });

    it('should return Twitch icon for twitch.tv', () => {
      const icon = getIconFromUrl('https://twitch.tv/channel');
      expect(icon).toBe(Twitch);
    });
  });

  describe('Messaging', () => {
    it('should return Telegram icon for telegram.org', () => {
      const icon = getIconFromUrl('https://telegram.org');
      expect(icon).toBe(Telegram);
    });

    it('should return Telegram icon for t.me', () => {
      const icon = getIconFromUrl('https://t.me/channel');
      expect(icon).toBe(Telegram);
    });

    it('should return Slack icon for slack.com', () => {
      const icon = getIconFromUrl('https://slack.com/messages/channel');
      expect(icon).toBe(Slack);
    });
  });

  describe('Development', () => {
    it('should return Gitlab icon for gitlab.com', () => {
      const icon = getIconFromUrl('https://gitlab.com/user/repo');
      expect(icon).toBe(Gitlab);
    });
  });

  describe('Music', () => {
    it('should return Music icon for spotify.com', () => {
      const icon = getIconFromUrl('https://spotify.com/track/123');
      expect(icon).toBe(Music);
    });

    it('should return Music icon for soundcloud.com', () => {
      const icon = getIconFromUrl('https://soundcloud.com/artist/track');
      expect(icon).toBe(Music);
    });
  });

  describe('Communication', () => {
    it('should return Mail icon for gmail.com', () => {
      const icon = getIconFromUrl('https://gmail.com');
      expect(icon).toBe(Mail);
    });

    it('should return Mail icon for mailto: URLs', () => {
      const icon = getIconFromUrl('mailto:test@example.com');
      expect(icon).toBe(Mail);
    });

    it('should return Phone icon for tel: URLs', () => {
      const icon = getIconFromUrl('tel:+1234567890');
      expect(icon).toBe(Phone);
    });
  });

  describe('URL Variations', () => {
    it('should handle www prefix', () => {
      const icon = getIconFromUrl('https://www.github.com/user/repo');
      expect(icon).toBe(Github);
    });

    it('should handle subdomains', () => {
      const icon = getIconFromUrl('https://blog.github.com');
      expect(icon).toBe(Github);
    });

    it('should be case insensitive', () => {
      const icon = getIconFromUrl('https://GITHUB.COM/user/repo');
      expect(icon).toBe(Github);
    });

    it('should handle URLs with query parameters', () => {
      const icon = getIconFromUrl('https://youtube.com/watch?v=123&t=456');
      expect(icon).toBe(Youtube);
    });

    it('should handle URLs with hash fragments', () => {
      const icon = getIconFromUrl('https://github.com/user/repo#readme');
      expect(icon).toBe(Github);
    });
  });

  describe('Default Behavior', () => {
    it('should return Link icon for unknown domains', () => {
      const icon = getIconFromUrl('https://example.com');
      expect(icon).toBe(Link);
    });

    it('should return Link icon for invalid URLs', () => {
      const icon = getIconFromUrl('not-a-valid-url');
      expect(icon).toBe(Link);
    });

    it('should return Link icon for empty strings', () => {
      const icon = getIconFromUrl('');
      expect(icon).toBe(Link);
    });
  });
});

describe('getLabelFromUrl', () => {
  it('should extract domain without www', () => {
    const label = getLabelFromUrl('https://www.github.com');
    expect(label).toBe('github.com');
  });

  it('should include path for meaningful paths', () => {
    const label = getLabelFromUrl('https://github.com/user/repo');
    expect(label).toBe('github.com/user/repo');
  });

  it('should not include trailing slash', () => {
    const label = getLabelFromUrl('https://github.com/');
    expect(label).toBe('github.com');
  });

  it('should handle mailto: URLs', () => {
    const label = getLabelFromUrl('mailto:test@example.com');
    expect(label).toBe('test@example.com');
  });

  it('should handle tel: URLs', () => {
    const label = getLabelFromUrl('tel:+1234567890');
    expect(label).toBe('+1234567890');
  });

  it('should return original string for invalid URLs', () => {
    const label = getLabelFromUrl('not-a-valid-url');
    expect(label).toBe('not-a-valid-url');
  });

  it('should handle URLs with query parameters', () => {
    const label = getLabelFromUrl('https://youtube.com/watch?v=123');
    expect(label).toBe('youtube.com/watch');
  });
});
