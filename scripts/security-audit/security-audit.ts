/**
 * Daily npm security audit reporter.
 *
 * Reads two `npm audit --json` reports (full dependency tree and `--omit=dev`,
 * both lockfile-based, no install required), keeps critical and high severity
 * findings, renders a markdown report and syncs a single tracking issue in the
 * repo: created when findings appear, updated while they evolve, closed when
 * the advisories are resolved. The issue marker in the body guarantees no
 * duplicates.
 *
 * Usage: node scripts/security-audit/security-audit.ts <audit-all.json> <audit-prod.json> [report.md]
 *
 * Issue sync runs only when GITHUB_TOKEN and GITHUB_REPOSITORY are set (CI);
 * locally the script stops after rendering the report. The process exit code
 * stays 0 when findings exist: the tracking issue is the visibility channel,
 * a failed job would only re-run the same report. Non-zero exit is reserved
 * for operational errors (unreadable/invalid audit JSON, GitHub API failure).
 */

import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// npm audit v2 JSON shapes (only the fields this report consumes)
// ---------------------------------------------------------------------------

export interface AuditAdvisory {
  name: string;
  title: string;
  url: string;
  severity: string;
  range: string;
}

export interface AuditFix {
  name: string;
  version: string;
  isSemVerMajor: boolean;
}

export interface AuditVulnerability {
  name: string;
  severity: string;
  isDirect: boolean;
  via: Array<string | AuditAdvisory>;
  range: string;
  nodes: string[];
  fixAvailable: boolean | AuditFix;
}

export interface AuditReport {
  vulnerabilities: Record<string, AuditVulnerability>;
  metadata: { vulnerabilities: Record<string, number> };
  error?: { code?: string; summary?: string; detail?: string };
}

export interface ReportAdvisory {
  id: string;
  title: string;
  url: string;
  severity: string;
  ranges: string[];
}

export type FixSummary =
  | { kind: 'bump'; version: string; isSemVerMajor: boolean }
  | { kind: 'parent'; name: string; version: string; isSemVerMajor: boolean }
  | { kind: 'transitive' }
  | { kind: 'none' };

export interface Finding {
  packageName: string;
  severity: 'critical' | 'high';
  isDirect: boolean;
  inProduction: boolean;
  advisories: ReportAdvisory[];
  passThrough: string[];
  fix: FixSummary;
  paths: string[];
}

export interface TrackingIssue {
  number: number;
  state: string;
  body: string | null;
}

export type IssuePlan =
  | { action: 'create'; title: string; body: string }
  | { action: 'update'; issueNumber: number; title: string; body: string }
  | { action: 'reopen'; issueNumber: number; title: string; body: string }
  | { action: 'close'; issueNumber: number; comment: string }
  | { action: 'none'; reason: string };

/** Unique token searched via the issue-search API; age-bounded issue listing would lose long-lived tracking issues. */
export const ISSUE_MARKER_TOKEN = 'pubky-security-audit-tracking';
export const ISSUE_MARKER = `<!-- ${ISSUE_MARKER_TOKEN} -->`;

const TRACKED_SEVERITIES = new Set(['critical', 'high']);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseAuditReport(raw: unknown, label: string): AuditReport {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${label}: npm audit output is not a JSON object — the audit itself may have failed.`);
  }
  const report = raw as Partial<AuditReport>;
  if (report.error) {
    const { code = 'UNKNOWN', summary = 'no summary' } = report.error;
    throw new Error(`${label}: npm audit failed with ${code}: ${summary}`);
  }
  if (typeof report.vulnerabilities !== 'object' || report.vulnerabilities === null) {
    throw new Error(`${label}: npm audit output has no "vulnerabilities" map — unexpected format.`);
  }
  return report as AuditReport;
}

function advisoryId(advisory: AuditAdvisory): string {
  const segments = advisory.url.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last && last.startsWith('GHSA-') ? last : advisory.url;
}

function normalizeFix(packageName: string, fixAvailable: boolean | AuditFix): FixSummary {
  if (fixAvailable === true) return { kind: 'transitive' };
  if (fixAvailable === false) return { kind: 'none' };
  if (fixAvailable.name === packageName) {
    return { kind: 'bump', version: fixAvailable.version, isSemVerMajor: fixAvailable.isSemVerMajor };
  }
  return {
    kind: 'parent',
    name: fixAvailable.name,
    version: fixAvailable.version,
    isSemVerMajor: fixAvailable.isSemVerMajor,
  };
}

/** `node_modules/a/node_modules/b` becomes `a > b`; a root-level package has no visible parent. */
export function nodePathToChain(nodePath: string): string {
  const segments = nodePath.split('/node_modules/').map((segment) => segment.replace(/^node_modules\//, ''));
  return segments.filter(Boolean).join(' > ');
}

export function collectFindings(full: AuditReport, prod: AuditReport): Finding[] {
  const productionPackages = new Set(Object.keys(prod.vulnerabilities));
  const findings: Finding[] = [];

  for (const [packageName, vulnerability] of Object.entries(full.vulnerabilities)) {
    if (!TRACKED_SEVERITIES.has(vulnerability.severity)) continue;

    const advisoriesById = new Map<string, ReportAdvisory>();
    const passThrough: string[] = [];
    for (const via of vulnerability.via) {
      if (typeof via === 'string') {
        passThrough.push(via);
        continue;
      }
      if (!TRACKED_SEVERITIES.has(via.severity)) continue;
      const id = advisoryId(via);
      const existing = advisoriesById.get(id);
      if (existing) {
        if (!existing.ranges.includes(via.range)) existing.ranges.push(via.range);
      } else {
        advisoriesById.set(id, { id, title: via.title, url: via.url, severity: via.severity, ranges: [via.range] });
      }
    }

    const chains = [...new Set(vulnerability.nodes.map(nodePathToChain))].filter((chain) => chain.length > 0);

    findings.push({
      packageName,
      severity: vulnerability.severity as Finding['severity'],
      isDirect: vulnerability.isDirect,
      inProduction: productionPackages.has(packageName),
      advisories: [...advisoriesById.values()].sort((a, b) => a.id.localeCompare(b.id)),
      passThrough,
      fix: normalizeFix(packageName, vulnerability.fixAvailable),
      paths: chains,
    });
  }

  return findings.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
    return a.packageName.localeCompare(b.packageName);
  });
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

export function formatFix(fix: FixSummary): string {
  switch (fix.kind) {
    case 'bump':
      return `bump to \`${fix.version}\`${fix.isSemVerMajor ? ' (semver-major)' : ''}`;
    case 'parent':
      return `via \`${fix.name}@${fix.version}\`${fix.isSemVerMajor ? ' (semver-major)' : ''}`;
    case 'transitive':
      return 'transitive (`npm audit fix` or `overrides`)';
    case 'none':
      return '**no fix published yet**';
  }
}

function renderTable(findings: Finding[]): string {
  const header = '| Package | Severity | Kind | Fix | Advisories |\n| --- | --- | --- | --- | --- |';
  const rows = findings.map((finding) => {
    const advisories =
      finding.advisories.length > 0
        ? finding.advisories
            .map((advisory) => `[${advisory.id}](${advisory.url}) ${escapeCell(advisory.title)}`)
            .join('<br>')
        : `via ${finding.passThrough.map((parent) => `\`${parent}\``).join(', ')}`;
    return `| \`${finding.packageName}\` | ${finding.severity} | ${finding.isDirect ? 'direct' : 'transitive'} | ${formatFix(finding.fix)} | ${advisories} |`;
  });
  return [header, ...rows].join('\n');
}

export interface ReportContext {
  runUrl?: string;
  commitSha?: string;
  date: string;
}

export function buildReport(findings: Finding[], context: ReportContext): string {
  const critical = findings.filter((finding) => finding.severity === 'critical').length;
  const high = findings.length - critical;
  const production = findings.filter((finding) => finding.inProduction);
  const devOnly = findings.filter((finding) => !finding.inProduction);

  const lines: string[] = [];
  lines.push(`## Dependency security audit — ${context.date}`, '');
  lines.push(
    `\`npm audit\` reports **${critical} critical** and **${high} high** severity advisories ` +
      `across **${findings.length} packages**: **${production.length} in production dependencies**, ` +
      `${devOnly.length} dev-only. Moderate and lower severities are not tracked here.`,
    '',
  );
  lines.push(
    '> Reachability cannot be determined automatically. **Production dependencies install with ' +
      '`npm ci --omit=dev` and ship in the Docker image, so treat them as likely exposures and triage ' +
      'them first**: verify whether our code reaches the vulnerable path (example: `sharp` transcodes ' +
      'remote images on the unauthenticated OG image routes in `src/libs/og/ogData.ts`).',
    '',
  );

  lines.push(`### Production dependencies (${production.length})`, '');
  lines.push(production.length > 0 ? renderTable(production) : '_None — production dependencies are clean._', '');

  lines.push(`### Dev-only dependencies (${devOnly.length})`, '');
  lines.push(devOnly.length > 0 ? renderTable(devOnly) : '_None._', '');

  const transitive = findings.filter(
    (finding) => !finding.isDirect && finding.paths.some((path) => path.includes(' > ')),
  );
  if (transitive.length > 0) {
    lines.push('### Transitive dependency paths', '');
    lines.push('Where a vulnerable package enters the tree (run `npm ls <package>` locally for the full chain):', '');
    for (const finding of transitive) {
      const shown = finding.paths.filter((path) => path.includes(' > ')).slice(0, 3);
      const remaining =
        finding.paths.length - shown.length - finding.paths.filter((path) => !path.includes(' > ')).length;
      lines.push(`- \`${finding.packageName}\`:`);
      for (const path of shown) lines.push(`  - ${path}`);
      if (remaining > 0) lines.push(`  - …and ${remaining} more`);
    }
    lines.push('');
  }

  lines.push('### How to read the Fix column', '');
  lines.push('- `bump to x.y.z`: direct dependency — update the exact pin in `package.json`.');
  lines.push(
    '- `via parent@x.y.z`: the fix lands by upgrading the named parent; semver-major means a major parent upgrade.',
  );
  lines.push(
    '- `transitive`: the parent ranges already allow the fixed version — `npm audit fix` or an `overrides` entry resolves it.',
  );
  lines.push(
    '- Dependabot security updates open these bumps automatically when enabled; exact pins do not block them.',
  );
  lines.push('');

  const meta: string[] = [];
  if (context.runUrl) meta.push(`[workflow run](${context.runUrl})`);
  if (context.commitSha) meta.push(`commit \`${context.commitSha.slice(0, 7)}\``);
  lines.push('---');
  if (meta.length > 0) lines.push(meta.join(' · '));
  lines.push('', ISSUE_MARKER, '');
  return lines.join('\n');
}

export function buildIssueTitle(findings: Finding[]): string {
  const critical = findings.filter((finding) => finding.severity === 'critical').length;
  const high = findings.length - critical;
  const production = findings.filter((finding) => finding.inProduction).length;
  return `[security-audit] ${critical} critical, ${high} high npm vulnerabilities (${production} in production deps)`;
}

// ---------------------------------------------------------------------------
// Tracking issue
// ---------------------------------------------------------------------------

export function planIssueAction(
  findings: Finding[],
  existingIssue: TrackingIssue | null,
  title: string,
  body: string,
): IssuePlan {
  if (findings.length === 0) {
    if (existingIssue && existingIssue.state === 'open') {
      return {
        action: 'close',
        issueNumber: existingIssue.number,
        comment:
          'Latest `npm audit` run reports no remaining critical or high severity advisories. ' +
          'Closing — the daily audit reopens this issue if anything new appears.',
      };
    }
    return { action: 'none', reason: 'no findings and no open tracking issue' };
  }
  if (!existingIssue) return { action: 'create', title, body };
  if (existingIssue.state === 'open') return { action: 'update', issueNumber: existingIssue.number, title, body };
  return { action: 'reopen', issueNumber: existingIssue.number, title, body };
}

/** Structural subset of `Response` so tests can fake fetch without casting; global `fetch` satisfies it. */
export interface AuditFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<AuditFetchResponse>;

interface GitHubContext {
  apiUrl: string;
  repo: string;
  token: string;
}

async function gitHubRequest<T>(
  fetchImpl: FetchLike,
  context: GitHubContext,
  method: string,
  url: string,
  payload?: unknown,
): Promise<T> {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${context.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GitHub API ${method} ${url} failed with ${response.status}: ${text.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

function repoUrl(context: GitHubContext, path: string): string {
  return `${context.apiUrl}/repos/${context.repo}${path}`;
}

/**
 * Finds the single tracking issue by the body marker via issue search (`is:issue`
 * excludes PRs). An open hit wins over a closed one so a stale closed issue never
 * shadows a live tracker.
 */
export async function findTrackingIssue(fetchImpl: FetchLike, context: GitHubContext): Promise<TrackingIssue | null> {
  const query = encodeURIComponent(`repo:${context.repo} is:issue in:body "${ISSUE_MARKER_TOKEN}"`);
  const result = await gitHubRequest<{ items: Array<{ number: number; state: string; body: string | null }> }>(
    fetchImpl,
    context,
    'GET',
    `${context.apiUrl}/search/issues?q=${query}&sort=created&order=desc&per_page=10`,
  );
  const matches = result.items.filter((issue) => issue.body?.includes(ISSUE_MARKER));
  return matches.find((issue) => issue.state === 'open') ?? matches[0] ?? null;
}

export async function applyIssuePlan(fetchImpl: FetchLike, context: GitHubContext, plan: IssuePlan): Promise<string> {
  switch (plan.action) {
    case 'create':
      await gitHubRequest(fetchImpl, context, 'POST', repoUrl(context, '/issues'), {
        title: plan.title,
        body: plan.body,
      });
      return 'created a new tracking issue';
    case 'update':
      await gitHubRequest(fetchImpl, context, 'PATCH', repoUrl(context, `/issues/${plan.issueNumber}`), {
        title: plan.title,
        body: plan.body,
      });
      return `updated tracking issue #${plan.issueNumber}`;
    case 'reopen':
      await gitHubRequest(fetchImpl, context, 'PATCH', repoUrl(context, `/issues/${plan.issueNumber}`), {
        state: 'open',
        title: plan.title,
        body: plan.body,
      });
      return `reopened tracking issue #${plan.issueNumber}`;
    case 'close':
      await gitHubRequest(fetchImpl, context, 'POST', repoUrl(context, `/issues/${plan.issueNumber}/comments`), {
        body: plan.comment,
      });
      await gitHubRequest(fetchImpl, context, 'PATCH', repoUrl(context, `/issues/${plan.issueNumber}`), {
        state: 'closed',
      });
      return `closed tracking issue #${plan.issueNumber}`;
    case 'none':
      return `no issue action needed (${plan.reason})`;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function main(argv: string[], env: Record<string, string | undefined> = process.env): Promise<void> {
  const [allPath, prodPath, reportPath] = argv;
  if (!allPath || !prodPath) {
    throw new Error(
      'Usage: node scripts/security-audit/security-audit.ts <audit-all.json> <audit-prod.json> [report.md]',
    );
  }

  const full = parseAuditReport(JSON.parse(readFileSync(allPath, 'utf8')), allPath);
  const prod = parseAuditReport(JSON.parse(readFileSync(prodPath, 'utf8')), prodPath);
  const findings = collectFindings(full, prod);

  const context: ReportContext = { date: new Date().toISOString().slice(0, 10) };
  if (env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    context.runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  }
  if (env.GITHUB_SHA) context.commitSha = env.GITHUB_SHA;

  const report = buildReport(findings, context);
  if (reportPath) writeFileSync(reportPath, report);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, report);

  const critical = findings.filter((finding) => finding.severity === 'critical').length;
  console.log(
    `npm audit: ${critical} critical, ${findings.length - critical} high across ${findings.length} packages.`,
  );

  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) {
    console.log('GITHUB_TOKEN/GITHUB_REPOSITORY not set — skipping tracking issue sync (local run).');
    return;
  }

  const gitHub: GitHubContext = {
    apiUrl: env.GITHUB_API_URL ?? 'https://api.github.com',
    repo: env.GITHUB_REPOSITORY,
    token: env.GITHUB_TOKEN,
  };
  const existingIssue = await findTrackingIssue(fetch, gitHub);
  const plan = planIssueAction(findings, existingIssue, buildIssueTitle(findings), report);
  const outcome = await applyIssuePlan(fetch, gitHub, plan);
  console.log(`Tracking issue: ${outcome}.`);
}

const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? `security-audit: ${error.message}` : error);
    process.exitCode = 1;
  });
}
