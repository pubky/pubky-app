import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditReport, AuditVulnerability, Finding, TrackingIssue } from './security-audit';
import {
  applyIssuePlan,
  buildChangeComment,
  buildIssueTitle,
  buildPublicSummary,
  buildReport,
  collectFindings,
  DEFAULT_ISSUES_REPO,
  extractAdvisoryIds,
  findTrackingIssue,
  ISSUE_MARKER,
  ISSUE_MARKER_TOKEN,
  main,
  nodePathToChain,
  parseAuditReport,
  planIssueAction,
} from './security-audit';

function vulnerability(overrides: Partial<AuditVulnerability>): AuditVulnerability {
  return {
    name: 'pkg',
    severity: 'high',
    isDirect: false,
    via: [],
    range: '<1.0.0',
    nodes: ['node_modules/pkg'],
    fixAvailable: false,
    ...overrides,
  };
}

function auditReport(vulnerabilities: Record<string, AuditVulnerability>): AuditReport {
  return { vulnerabilities, metadata: { vulnerabilities: {} } };
}

const sharpAdvisory = {
  name: 'sharp',
  title: 'sharp : Vulnerability in librsvg dependency CVE-2026-96889',
  url: 'https://github.com/advisories/GHSA-wq5f-xc86-pv6w',
  severity: 'high',
  range: '<0.35.5',
};

const sentryAdvisory = {
  name: '@sentry/nextjs',
  title: 'Sentry-Javascript: Middleware Bypass when using Tunnel route',
  url: 'https://github.com/advisories/GHSA-mchm-gjx6-7h55',
  severity: 'critical',
  range: '>=10.0.0-alpha.0 <10.75.2',
};

function sampleReports(): { full: AuditReport; prod: AuditReport } {
  const full = auditReport({
    next: vulnerability({
      name: 'next',
      severity: 'critical',
      isDirect: true,
      via: [
        {
          ...sentryAdvisory,
          name: 'next',
          title: 'Next.js: RCE in Image Optimization API when SVG files are used',
          url: 'https://github.com/advisories/GHSA-2464-fhr4-w9xw',
        },
        {
          ...sentryAdvisory,
          name: 'next',
          title: 'Next.js: RCE in `use cache` functions returning typed arrays',
          url: 'https://github.com/advisories/GHSA-673q-mjm6-r5xr',
        },
        {
          ...sentryAdvisory,
          name: 'next',
          title: 'Next.js: moderate issue not listed',
          url: 'https://github.com/advisories/GHSA-0000-aaaa-bbbb',
          severity: 'moderate',
        },
      ],
      range: '16.0.0 - 16.4.0',
      nodes: ['node_modules/next'],
      fixAvailable: { name: 'next', version: '16.4.3', isSemVerMajor: false },
    }),
    '@sentry/nextjs': vulnerability({
      name: '@sentry/nextjs',
      severity: 'critical',
      isDirect: true,
      via: [sentryAdvisory],
      range: '10.0.0-alpha.0 - 10.75.1',
      nodes: ['node_modules/@sentry/nextjs'],
      fixAvailable: { name: '@sentry/nextjs', version: '10.77.1', isSemVerMajor: false },
    }),
    sharp: vulnerability({
      name: 'sharp',
      severity: 'high',
      isDirect: true,
      via: [sharpAdvisory],
      range: '<0.35.5',
      nodes: ['node_modules/sharp'],
      fixAvailable: { name: 'sharp', version: '0.35.5', isSemVerMajor: false },
    }),
    'brace-expansion': vulnerability({
      name: 'brace-expansion',
      severity: 'high',
      via: [
        {
          ...sharpAdvisory,
          name: 'brace-expansion',
          title: 'brace-expansion: CPU denial of service',
          url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr',
          range: '<1.1.21',
        },
        {
          ...sharpAdvisory,
          name: 'brace-expansion',
          title: 'brace-expansion: CPU denial of service',
          url: 'https://github.com/advisories/GHSA-q2hr-2g5m-vwhr',
          range: '>=4.0.0 <5.0.12',
        },
      ],
      nodes: [
        'node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion',
        'node_modules/brace-expansion',
      ],
      fixAvailable: true,
    }),
    '@serwist/next': vulnerability({
      name: '@serwist/next',
      severity: 'high',
      isDirect: true,
      via: ['@serwist/build', 'zod'],
      range: '>=9.0.0-alpha.0 <9.5.12',
      nodes: ['node_modules/@serwist/next'],
      fixAvailable: { name: '@serwist/next', version: '8.4.4', isSemVerMajor: true },
    }),
    cypress: vulnerability({
      name: 'cypress',
      severity: 'high',
      isDirect: true,
      via: ['extract-zip'],
      range: '>=15.0.0',
      nodes: ['node_modules/cypress'],
      fixAvailable: { name: 'cypress', version: '15.21.1', isSemVerMajor: false },
    }),
    zod: vulnerability({ name: 'zod', severity: 'moderate', isDirect: true, fixAvailable: true }),
  });
  const prod = auditReport({
    next: full.vulnerabilities.next,
    '@sentry/nextjs': full.vulnerabilities['@sentry/nextjs'],
    sharp: full.vulnerabilities.sharp,
    'brace-expansion': full.vulnerabilities['brace-expansion'],
    '@serwist/next': full.vulnerabilities['@serwist/next'],
  });
  return { full, prod };
}

describe('parseAuditReport', () => {
  it('accepts a well-formed report', () => {
    expect(parseAuditReport(auditReport({}), 'all')).toBeDefined();
  });

  it('rejects npm error payloads with the npm error code', () => {
    expect(() =>
      parseAuditReport({ error: { code: 'EAUDITNOLOCK', summary: 'Requires existing lockfile' } }, 'all'),
    ).toThrow('EAUDITNOLOCK');
  });

  it('rejects non-object and malformed output', () => {
    expect(() => parseAuditReport(null, 'all')).toThrow('not a JSON object');
    expect(() => parseAuditReport({ metadata: {} }, 'all')).toThrow('no "vulnerabilities" map');
  });
});

describe('collectFindings', () => {
  it('keeps only critical and high entries, dropping moderate and below', () => {
    const { full, prod } = sampleReports();
    const findings = collectFindings(full, prod);
    expect(findings.map((finding) => finding.packageName)).not.toContain('zod');
    expect(findings).toHaveLength(6);
  });

  it('sorts critical first, then direct, then alphabetically', () => {
    const { full, prod } = sampleReports();
    const findings = collectFindings(full, prod);
    expect(findings.map((finding) => finding.packageName)).toEqual([
      '@sentry/nextjs',
      'next',
      '@serwist/next',
      'cypress',
      'sharp',
      'brace-expansion',
    ]);
  });

  it('classifies production vs dev-only from the --omit=dev report', () => {
    const { full, prod } = sampleReports();
    const findings = collectFindings(full, prod);
    const byName = new Map(findings.map((finding) => [finding.packageName, finding]));
    expect(byName.get('sharp')?.inProduction).toBe(true);
    expect(byName.get('cypress')?.inProduction).toBe(false);
  });

  it('dedupes advisories by GHSA id, merges ranges, and drops lower severities', () => {
    const { full, prod } = sampleReports();
    const findings = collectFindings(full, prod);
    const brace = findings.find((finding) => finding.packageName === 'brace-expansion');
    expect(brace?.advisories).toHaveLength(1);
    expect(brace?.advisories[0].id).toBe('GHSA-q2hr-2g5m-vwhr');
    expect(brace?.advisories[0].ranges).toEqual(['<1.1.21', '>=4.0.0 <5.0.12']);
    const next = findings.find((finding) => finding.packageName === 'next');
    expect(next?.advisories.map((advisory) => advisory.id)).toEqual(['GHSA-2464-fhr4-w9xw', 'GHSA-673q-mjm6-r5xr']);
  });

  it('collects pass-through parents from string via entries', () => {
    const { full, prod } = sampleReports();
    const serwist = collectFindings(full, prod).find((finding) => finding.packageName === '@serwist/next');
    expect(serwist?.advisories).toHaveLength(0);
    expect(serwist?.passThrough).toEqual(['@serwist/build', 'zod']);
  });

  it('normalises the four fixAvailable shapes', () => {
    const { full, prod } = sampleReports();
    const findings = collectFindings(full, prod);
    const byName = new Map(findings.map((finding) => [finding.packageName, finding]));
    expect(byName.get('sharp')?.fix).toEqual({ kind: 'bump', version: '0.35.5', isSemVerMajor: false });
    expect(byName.get('@serwist/next')?.fix).toEqual({ kind: 'bump', version: '8.4.4', isSemVerMajor: true });
    expect(byName.get('brace-expansion')?.fix).toEqual({ kind: 'transitive' });
    expect(byName.get('cypress')?.fix).toEqual({ kind: 'bump', version: '15.21.1', isSemVerMajor: false });

    const parentFix = collectFindings(
      auditReport({
        'js-yaml': vulnerability({
          name: 'js-yaml',
          via: [{ ...sharpAdvisory, name: 'js-yaml' }],
          fixAvailable: { name: '@mdxeditor/editor', version: '4.3.4', isSemVerMajor: false },
        }),
      }),
      auditReport({}),
    );
    expect(parentFix[0].fix).toEqual({
      kind: 'parent',
      name: '@mdxeditor/editor',
      version: '4.3.4',
      isSemVerMajor: false,
    });
  });

  it('renders nested node paths as dependency chains', () => {
    const { full, prod } = sampleReports();
    const brace = collectFindings(full, prod).find((finding) => finding.packageName === 'brace-expansion');
    expect(brace?.paths).toContain('@typescript-eslint/typescript-estree > brace-expansion');
  });
});

describe('nodePathToChain', () => {
  it('formats nested and root paths', () => {
    expect(nodePathToChain('node_modules/a/node_modules/b')).toBe('a > b');
    expect(nodePathToChain('node_modules/b')).toBe('b');
  });
});

describe('buildReport', () => {
  function sampleFindings(): Finding[] {
    const { full, prod } = sampleReports();
    return collectFindings(full, prod);
  }

  it('lists every tracked advisory with severity counts and the issue marker', () => {
    const report = buildReport(sampleFindings(), { date: '2026-10-28' });
    expect(report).toContain('**2 critical** and **4 high**');
    expect(report).toContain('GHSA-2464-fhr4-w9xw');
    expect(report).toContain('GHSA-mchm-gjx6-7h55');
    expect(report).toContain('GHSA-wq5f-xc86-pv6w');
    expect(report).not.toContain('GHSA-0000-aaaa-bbbb');
    expect(report).toContain(ISSUE_MARKER);
  });

  it('splits production and dev-only findings and flags production for triage', () => {
    const report = buildReport(sampleFindings(), { date: '2026-10-28' });
    expect(report).toContain('### Production dependencies (5)');
    expect(report).toContain('### Dev-only dependencies (1)');
    expect(report.indexOf('### Production dependencies')).toBeLessThan(report.indexOf('### Dev-only dependencies'));
    expect(report).toContain('likely exposures');
    expect(report).toContain('`cypress`');
  });

  it('describes the standalone traced subset accurately and names no reachability suspects', () => {
    const report = buildReport(sampleFindings(), { date: '2026-10-28' });
    expect(report).toContain('.next/standalone');
    expect(report).toContain('traced subset of production dependencies');
    expect(report).not.toContain('ogData');
    expect(report).not.toContain('unauthenticated');
  });

  it('renders pass-through entries with their constraining parents', () => {
    const report = buildReport(sampleFindings(), { date: '2026-10-28' });
    expect(report).toContain('via `@serwist/build`, `zod`');
    expect(report).toContain('(semver-major)');
  });

  it('renders the transitive dependency paths section only for nested transitive findings', () => {
    const report = buildReport(sampleFindings(), { date: '2026-10-28' });
    expect(report).toContain('### Transitive dependency paths');
    expect(report).toContain('@typescript-eslint/typescript-estree > brace-expansion');

    const directOnly = buildReport(
      [
        {
          packageName: 'sharp',
          severity: 'high',
          isDirect: true,
          inProduction: true,
          advisories: [],
          passThrough: [],
          fix: { kind: 'none' },
          paths: ['sharp'],
        },
      ],
      { date: '2026-10-28' },
    );
    expect(directOnly).not.toContain('### Transitive dependency paths');
    expect(directOnly).toContain('**no fix published yet**');
  });

  it('escapes pipes in advisory titles so tables do not break', () => {
    const report = buildReport(
      [
        {
          packageName: 'pkg',
          severity: 'high',
          isDirect: true,
          inProduction: true,
          advisories: [
            {
              id: 'GHSA-xxxx-yyyy-zzzz',
              title: 'a | b breaks tables',
              url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
              severity: 'high',
              ranges: ['<1'],
            },
          ],
          passThrough: [],
          fix: { kind: 'none' },
          paths: ['pkg'],
        },
      ],
      { date: '2026-10-28' },
    );
    expect(report).toContain('a \\| b breaks tables');
  });

  it('links the workflow run and commit when provided', () => {
    const report = buildReport(sampleFindings(), {
      date: '2026-10-28',
      runUrl: 'https://github.com/pubky/pubky-app/actions/runs/1',
      commitSha: '1234567890abcdef',
    });
    expect(report).toContain('[workflow run](https://github.com/pubky/pubky-app/actions/runs/1)');
    expect(report).toContain('commit `1234567`');
  });
});

describe('buildPublicSummary', () => {
  function sampleFindings(): Finding[] {
    const { full, prod } = sampleReports();
    return collectFindings(full, prod);
  }

  it('carries aggregate counts and the tracking pointer', () => {
    const summary = buildPublicSummary(
      sampleFindings(),
      { date: '2026-10-28' },
      `updated ${DEFAULT_ISSUES_REPO}#7 — https://github.com/${DEFAULT_ISSUES_REPO}/issues/7`,
    );
    expect(summary).toContain('**2 critical** and **4 high**');
    expect(summary).toContain('**6 packages**');
    expect(summary).toContain('**5 in production dependencies**');
    expect(summary).toContain(`${DEFAULT_ISSUES_REPO}#7`);
  });

  it('never leaks package names, advisory ids or fix details', () => {
    const summary = buildPublicSummary(sampleFindings(), { date: '2026-10-28' }, 'created pubky/internal-issues#3');
    expect(summary).not.toContain('GHSA-');
    expect(summary).not.toContain('sharp');
    expect(summary).not.toContain('`next`');
    expect(summary).not.toContain('cypress');
    expect(summary).not.toContain('@sentry');
    expect(summary).not.toContain('no fix published');
    expect(summary).not.toContain(ISSUE_MARKER);
  });

  it('reports a clean audit without a findings table', () => {
    const summary = buildPublicSummary([], { date: '2026-10-28' }, 'closed pubky/internal-issues#7');
    expect(summary).toContain('no critical or high severity advisories');
    expect(summary).not.toContain('GHSA-');
  });
});

describe('extractAdvisoryIds', () => {
  it('extracts unique lowercased GHSA ids from a body', () => {
    const ids = extractAdvisoryIds('see GHSA-2464-fhr4-w9xw and ghsa-mchm-gjx6-7h55, repeat GHSA-2464-fhr4-w9xw');
    expect([...ids].sort()).toEqual(['ghsa-2464-fhr4-w9xw', 'ghsa-mchm-gjx6-7h55']);
  });

  it('returns an empty set when no ids are present', () => {
    expect(extractAdvisoryIds(`no advisories ${ISSUE_MARKER}`).size).toBe(0);
  });
});

describe('buildChangeComment', () => {
  const { full, prod } = sampleReports();
  const findings = collectFindings(full, prod);
  const allIds = ['GHSA-2464-fhr4-w9xw', 'GHSA-673q-mjm6-r5xr', 'GHSA-mchm-gjx6-7h55', 'GHSA-wq5f-xc86-pv6w'];

  it('returns null when the advisory set is unchanged', () => {
    const previousBody = `${allIds.join(' ')} GHSA-q2hr-2g5m-vwhr ${ISSUE_MARKER}`;
    expect(buildChangeComment(previousBody, findings, '2026-10-29')).toBeNull();
  });

  it('lists new advisories with severity and package, highlighting new criticals', () => {
    const comment = buildChangeComment(`only GHSA-mchm-gjx6-7h55 known ${ISSUE_MARKER}`, findings, '2026-10-29');
    expect(comment).toContain('**2 new critical**');
    expect(comment).toContain('GHSA-2464-fhr4-w9xw (critical, in `next`)');
    expect(comment).toContain('GHSA-wq5f-xc86-pv6w (high, in `sharp`)');
    expect(comment).toContain('New (4)');
    expect(comment).not.toContain('Resolved');
  });

  it('lists resolved advisories without a critical highlight', () => {
    const previousBody = `${allIds.join(' ')} GHSA-q2hr-2g5m-vwhr GHSA-aaaa-bbbb-cccc ${ISSUE_MARKER}`;
    const comment = buildChangeComment(previousBody, findings, '2026-10-29');
    expect(comment).toContain('Resolved (1)');
    expect(comment).toContain('- GHSA-aaaa-bbbb-cccc');
    expect(comment).not.toContain('new critical');
    expect(comment).not.toContain('New (');
  });

  it('reports a fully new set against a body without advisories', () => {
    const comment = buildChangeComment(`bootstrapped ${ISSUE_MARKER}`, findings, '2026-10-29');
    expect(comment).toContain('New (5)');
    expect(comment).toContain('GHSA-q2hr-2g5m-vwhr (high, in `brace-expansion`)');
  });
});

describe('buildIssueTitle', () => {
  it('summarises severities and production exposure', () => {
    const { full, prod } = sampleReports();
    expect(buildIssueTitle(collectFindings(full, prod))).toBe(
      '[security-audit] 2 critical, 4 high npm vulnerabilities (5 in production deps)',
    );
  });
});

describe('planIssueAction', () => {
  const { full, prod } = sampleReports();
  const findings = collectFindings(full, prod);
  const openIssue: TrackingIssue = { number: 7, state: 'open', body: `old ${ISSUE_MARKER}` };

  it('creates when findings exist and there is no tracking issue', () => {
    const plan = planIssueAction(findings, null, 'title', 'body');
    expect(plan).toEqual({ action: 'create', title: 'title', body: 'body' });
  });

  it('updates the open tracking issue', () => {
    const plan = planIssueAction(findings, openIssue, 'title', 'body');
    expect(plan).toEqual({ action: 'update', issueNumber: 7, title: 'title', body: 'body' });
  });

  it('reopens a closed tracking issue', () => {
    const plan = planIssueAction(findings, { ...openIssue, state: 'closed' }, 'title', 'body');
    expect(plan).toEqual({ action: 'reopen', issueNumber: 7, title: 'title', body: 'body' });
  });

  it('closes the open tracking issue when findings are resolved', () => {
    const plan = planIssueAction([], openIssue, 'title', 'body');
    expect(plan.action).toBe('close');
    expect(plan).toMatchObject({ issueNumber: 7 });
  });

  it('does nothing when clean and there is no open issue', () => {
    expect(planIssueAction([], null, 'title', 'body')).toEqual({
      action: 'none',
      reason: 'no findings and no open tracking issue',
    });
    expect(planIssueAction([], { ...openIssue, state: 'closed' }, 'title', 'body').action).toBe('none');
  });
});

describe('findTrackingIssue', () => {
  const context = { apiUrl: 'https://api.github.com', repo: DEFAULT_ISSUES_REPO, token: 'token' };

  function fakeFetch(items: unknown) {
    const calls: string[] = [];
    const fetchImpl = (url: string) => {
      calls.push(url);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items }),
        text: () => Promise.resolve(JSON.stringify({ items })),
      });
    };
    return { fetchImpl, calls };
  }

  it('searches the private tracking repo by the marker token', async () => {
    const { fetchImpl, calls } = fakeFetch([]);
    await findTrackingIssue(fetchImpl, context);
    expect(calls[0]).toContain('/search/issues?q=');
    expect(calls[0]).toContain(encodeURIComponent(`repo:${DEFAULT_ISSUES_REPO}`));
    expect(calls[0]).toContain(encodeURIComponent(`"${ISSUE_MARKER_TOKEN}"`));
    expect(calls[0]).toContain('is%3Aissue');
  });

  it('prefers an open marker issue over a closed one', async () => {
    const { fetchImpl } = fakeFetch([
      { number: 10, state: 'closed', body: `closed ${ISSUE_MARKER}` },
      { number: 8, state: 'open', body: `open ${ISSUE_MARKER}` },
    ]);
    const issue = await findTrackingIssue(fetchImpl, context);
    expect(issue?.number).toBe(8);
  });

  it('falls back to the newest closed marker issue', async () => {
    const { fetchImpl } = fakeFetch([
      { number: 10, state: 'closed', body: `newer ${ISSUE_MARKER}` },
      { number: 8, state: 'closed', body: `older ${ISSUE_MARKER}` },
    ]);
    expect((await findTrackingIssue(fetchImpl, context))?.number).toBe(10);
  });

  it('ignores search false positives without the exact marker and nulls on no match', async () => {
    const { fetchImpl } = fakeFetch([{ number: 9, state: 'open', body: 'mentions pubky-security-audit loosely' }]);
    expect(await findTrackingIssue(fetchImpl, context)).toBeNull();
    expect(await findTrackingIssue(fakeFetch([]).fetchImpl, context)).toBeNull();
  });
});

describe('applyIssuePlan', () => {
  const context = { apiUrl: 'https://api.github.com', repo: DEFAULT_ISSUES_REPO, token: 'token' };

  function recordingFetch() {
    const calls: Array<{ method: string; path: string; payload: unknown }> = [];
    const fetchImpl = (url: string, init?: RequestInit) => {
      calls.push({
        method: init?.method ?? 'GET',
        path: url.replace(`${context.apiUrl}/repos/${context.repo}`, ''),
        payload: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ number: 3 }),
        text: () => Promise.resolve(''),
      });
    };
    return { fetchImpl, calls };
  }

  it('posts a new issue on create and returns the pointer', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const outcome = await applyIssuePlan(fetchImpl, context, { action: 'create', title: 't', body: 'b' });
    expect(calls).toEqual([{ method: 'POST', path: '/issues', payload: { title: 't', body: 'b' } }]);
    expect(outcome).toBe(`created ${DEFAULT_ISSUES_REPO}#3`);
  });

  it('patches title and body on update without a comment when the set is unchanged', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const outcome = await applyIssuePlan(fetchImpl, context, {
      action: 'update',
      issueNumber: 7,
      title: 't',
      body: 'b',
    });
    expect(calls).toEqual([{ method: 'PATCH', path: '/issues/7', payload: { title: 't', body: 'b' } }]);
    expect(outcome).toContain('advisory set unchanged');
  });

  it('posts the change comment after the patch on update when provided', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const outcome = await applyIssuePlan(fetchImpl, context, {
      action: 'update',
      issueNumber: 7,
      title: 't',
      body: 'b',
      changeComment: 'delta',
    });
    expect(calls).toEqual([
      { method: 'PATCH', path: '/issues/7', payload: { title: 't', body: 'b' } },
      { method: 'POST', path: '/issues/7/comments', payload: { body: 'delta' } },
    ]);
    expect(outcome).toContain('posted a change comment');
  });

  it('reopens with state open and a regression comment on reopen', async () => {
    const { fetchImpl, calls } = recordingFetch();
    const outcome = await applyIssuePlan(fetchImpl, context, {
      action: 'reopen',
      issueNumber: 7,
      title: 't',
      body: 'b',
    });
    expect(calls).toEqual([
      { method: 'PATCH', path: '/issues/7', payload: { state: 'open', title: 't', body: 'b' } },
      { method: 'POST', path: '/issues/7/comments', payload: { body: expect.stringContaining('Reopened') } },
    ]);
    expect(outcome).toContain('regression comment');
  });

  it('comments then closes on close', async () => {
    const { fetchImpl, calls } = recordingFetch();
    await applyIssuePlan(fetchImpl, context, { action: 'close', issueNumber: 7, comment: 'resolved' });
    expect(calls).toEqual([
      { method: 'POST', path: '/issues/7/comments', payload: { body: 'resolved' } },
      { method: 'PATCH', path: '/issues/7', payload: { state: 'closed' } },
    ]);
  });

  it('throws with the API error body when the API fails', async () => {
    const fetchImpl = () =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('Resource not accessible by integration'),
      });
    await expect(applyIssuePlan(fetchImpl, context, { action: 'create', title: 't', body: 'b' })).rejects.toThrow(
      '403',
    );
  });
});

describe('main', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function writeSampleReports(): { dir: string; allPath: string; prodPath: string; reportPath: string } {
    const { full, prod } = sampleReports();
    const dir = mkdtempSync(join(tmpdir(), 'security-audit-'));
    const allPath = join(dir, 'all.json');
    const prodPath = join(dir, 'prod.json');
    const reportPath = join(dir, 'report.md');
    writeFileSync(allPath, JSON.stringify(full));
    writeFileSync(prodPath, JSON.stringify(prod));
    return { dir, allPath, prodPath, reportPath };
  }

  it('renders the report to disk and skips issue sync without a token locally', async () => {
    const { dir, allPath, prodPath, reportPath } = writeSampleReports();
    const summaryPath = join(dir, 'summary.md');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([allPath, prodPath, reportPath], { GITHUB_STEP_SUMMARY: summaryPath });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('2 critical, 4 high'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not synced (local run'));
    logSpy.mockRestore();

    const report = readFileSync(reportPath, 'utf8');
    expect(report).toContain(ISSUE_MARKER);
    expect(report).toContain('### Production dependencies (5)');

    // The public step summary carries counts only — no advisory details.
    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain('**2 critical** and **4 high**');
    expect(summary).not.toContain('GHSA-');
    expect(summary).not.toContain('`sharp`');
  });

  it('fails closed in CI when ISSUES_TOKEN is missing', async () => {
    const { allPath, prodPath, reportPath } = writeSampleReports();
    await expect(main([allPath, prodPath, reportPath], { GITHUB_ACTIONS: 'true' })).rejects.toThrow('ISSUES_TOKEN');
  });

  it('refuses to sync when the tracking repo would be the origin repository', async () => {
    const { allPath, prodPath, reportPath } = writeSampleReports();
    await expect(
      main([allPath, prodPath, reportPath], {
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'pubky/pubky-app',
        ISSUES_REPO: 'pubky/pubky-app',
        ISSUES_TOKEN: 'token',
      }),
    ).rejects.toThrow('must not be the origin repository');
  });

  it('creates the tracking issue in the private repo and publishes only a pointer', async () => {
    const { dir, allPath, prodPath, reportPath } = writeSampleReports();
    const summaryPath = join(dir, 'summary.md');
    const calls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      const isSearch = url.includes('/search/issues');
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(isSearch ? { items: [] } : { number: 42 }),
        text: () => Promise.resolve(''),
      });
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await main([allPath, prodPath, reportPath], {
      GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'pubky/pubky-app',
      GITHUB_STEP_SUMMARY: summaryPath,
      ISSUES_TOKEN: 'token',
    });
    logSpy.mockRestore();

    const create = calls.find((call) => call.method === 'POST');
    expect(create?.url).toBe(`https://api.github.com/repos/${DEFAULT_ISSUES_REPO}/issues`);
    expect(calls.every((call) => !call.url.includes('/repos/pubky/pubky-app/'))).toBe(true);

    const summary = readFileSync(summaryPath, 'utf8');
    expect(summary).toContain(`${DEFAULT_ISSUES_REPO}#42`);
    expect(summary).toContain(`https://github.com/${DEFAULT_ISSUES_REPO}/issues/42`);
    expect(summary).not.toContain('GHSA-');
  });
});
