import { getGithubLink, getNexusScoutLink, getTelegramLink, getTwitterLink } from '@/config/externalLinks';
import { getAuthor, getDefaultUrl, getSiteName } from '@/config/metadata';
import { escapeForInlineScript } from '@/libs/runtime-config/runtime-config';

/**
 * Publishes JSON-LD (schema.org) so AI agents and crawlers arriving anywhere on the site learn,
 * from the initial HTTP response alone, that the Pubky social graph (users, posts, follows,
 * tags, ...) can be queried through nexus-scout — a public, read-only Cypher API — and where its
 * full usage guide lives. `WebAPI` is the schema.org type for exactly this: an API accessible
 * over web technologies, described via its `documentation` link.
 */
export function StructuredData() {
  const siteUrl = getDefaultUrl();
  const nexusScoutUrl = getNexusScoutLink();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        name: getSiteName(),
        url: siteUrl,
        description:
          'Pubky App is a social-media-like experience built over Pubky Core, a decentralised, censorship-resistant protocol.',
        publisher: { '@id': `${siteUrl}/#organisation` },
      },
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organisation`,
        name: getAuthor(),
        url: siteUrl,
        sameAs: [getGithubLink(), getTwitterLink(), getTelegramLink()],
      },
      {
        '@type': 'WebAPI',
        '@id': `${nexusScoutUrl}/#webapi`,
        name: 'nexus-scout',
        description:
          'Public, read-only Cypher gateway to the Pubky social graph: users, posts, follows, replies, ' +
          'reposts, tags, mentions, bookmarks, and mutes. No account or API key required.',
        url: nexusScoutUrl,
        documentation: `${nexusScoutUrl}/llms.txt`,
        provider: { '@id': `${siteUrl}/#organisation` },
        isPartOf: { '@id': `${siteUrl}/#website` },
      },
    ],
  };

  return (
    <script
      id="pubky-structured-data"
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: escapeForInlineScript(JSON.stringify(jsonLd)) }}
    />
  );
}
