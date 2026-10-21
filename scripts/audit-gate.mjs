#!/usr/bin/env node
// Dependency audit gate.
//
// Runs `npm audit --json` in every package and fails on any moderate, high or
// critical advisory and on five or more low ones. Production and development
// dependencies are both audited, because a compromised build tool runs with the
// developer's and the CI runner's privileges.
//
// `npm audit` has no count threshold of its own, so the decision is made here
// from `metadata.vulnerabilities`.
//
// The packages are the directories one level below the repository root that
// hold a package-lock.json, node_modules excluded, so a new package is audited
// without anyone remembering to list it here.
//
// Exit codes:
//   0  every package is within the thresholds
//   1  at least one package is over a threshold
//   2  an audit could not be read: registry or network error, npm failure or
//      timeout, output that is not an audit report, or no package found.
//      Never treated as a pass.
//
// Usage:
//   node scripts/audit-gate.mjs                      audits every package of the repository
//   node scripts/audit-gate.mjs --root some/dir      audits the packages one level below some/dir
//   node scripts/audit-gate.mjs --input report.json  decides on a saved report

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOW_LIMIT = 5;
export const AUDIT_TIMEOUT_MS = 120_000;
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

/**
 * The packages under a root: its direct subdirectories that have a
 * package-lock.json, node_modules excluded, in name order.
 *
 * @param {string} root
 * @returns {string[]}
 */
export function discoverPackages(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .filter((entry) => existsSync(join(root, entry.name, 'package-lock.json')))
    .map((entry) => entry.name)
    .sort();
}

export const EXIT = { PASS: 0, FAILED: 1, UNREADABLE: 2 };

/**
 * Decides on the raw stdout of `npm audit --json`.
 *
 * @param {string} raw
 * @returns {{ status: 'pass' | 'fail' | 'unreadable', counts: Record<string, number> | null, reason: string }}
 */
export function decide(raw) {
  let report;
  try {
    report = JSON.parse(raw);
  } catch {
    return unreadable('output is not JSON');
  }

  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return unreadable('output is not an audit report');
  }
  if (report.error) {
    const detail = report.error.summary || report.error.code || 'unknown error';
    return unreadable(`npm audit reported an error: ${detail}`);
  }

  const vulnerabilities = report.metadata?.vulnerabilities;
  if (vulnerabilities === null || typeof vulnerabilities !== 'object') {
    return unreadable('report has no metadata.vulnerabilities');
  }

  const counts = {};
  for (const severity of SEVERITIES) {
    const value = vulnerabilities[severity];
    if (!Number.isInteger(value) || value < 0) {
      return unreadable(`metadata.vulnerabilities.${severity} is not a count`);
    }
    counts[severity] = value;
  }

  const blocking = ['critical', 'high', 'moderate'].filter((s) => counts[s] > 0);
  if (blocking.length > 0) {
    const detail = blocking.map((s) => `${counts[s]} ${s}`).join(', ');
    return { status: 'fail', counts, reason: `${detail} (any moderate or above fails)`, vulnerable: vulnerablePackages(report) };
  }
  if (counts.low >= LOW_LIMIT) {
    return { status: 'fail', counts, reason: `${counts.low} low (${LOW_LIMIT} or more fails)`, vulnerable: vulnerablePackages(report) };
  }
  return { status: 'pass', counts, reason: 'within thresholds' };
}

/**
 * The vulnerable packages of a report with their severity, the worst first.
 * `vulnerabilities` of an npm audit report is keyed by package name, and
 * advisories of severity info are left out, as they are in the counts.
 *
 * @param {{ vulnerabilities?: unknown }} report
 * @returns {{ name: string, severity: string }[]}
 */
function vulnerablePackages(report) {
  const entries = report.vulnerabilities;
  if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) return [];

  return Object.entries(entries)
    .map(([name, entry]) => ({ name, severity: entry?.severity }))
    .filter(({ severity }) => SEVERITIES.indexOf(severity) > SEVERITIES.indexOf('info'))
    .sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity) || a.name.localeCompare(b.name));
}

function unreadable(reason) {
  return { status: 'unreadable', counts: null, reason };
}

/** One line per vulnerable package of each failing row, so the log says what to update. */
export function formatVulnerable(rows) {
  return rows
    .filter(({ result }) => result.status === 'fail' && result.vulnerable?.length > 0)
    .flatMap(({ name, result }) => [`\nVulnerable packages in ${name}:`, ...result.vulnerable.map((v) => `  ${v.severity.padEnd(8)}  ${v.name}`)])
    .join('\n');
}

/**
 * Combines per-package decisions into the process exit code.
 *
 * @param {{ status: string }[]} results
 */
export function exitCodeFor(results) {
  if (results.some((r) => r.status === 'unreadable')) return EXIT.UNREADABLE;
  if (results.some((r) => r.status === 'fail')) return EXIT.FAILED;
  return EXIT.PASS;
}

/** Renders the short per-package table. */
export function formatTable(rows) {
  const header = ['package', 'low', 'moderate', 'high', 'critical', 'result'];
  const lines = rows.map(({ name, result }) => [
    name,
    ...['low', 'moderate', 'high', 'critical'].map((s) => (result.counts ? String(result.counts[s]) : '-')),
    result.status === 'pass' ? 'pass' : `${result.status.toUpperCase()}: ${result.reason}`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const render = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [render(header), ...lines.map(render)].join('\n');
}

/**
 * Audits one package. A run that does not finish inside the timeout is
 * unreadable, like any other run that produced no report: a registry that
 * hangs must not hang the gate with it.
 *
 * @param {string} directory
 * @param {{ spawn?: typeof spawnSync, timeoutMs?: number }} [options]
 */
export function auditPackage(directory, { spawn = spawnSync, timeoutMs = AUDIT_TIMEOUT_MS } = {}) {
  // npm exits non-zero whenever it finds advisories, so the exit status is not
  // read: the report decides. `shell` is needed on Windows, where npm is a .cmd.
  const run = spawn('npm', ['audit', '--json'], {
    cwd: directory,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (run.error?.code === 'ETIMEDOUT') return unreadable(`npm audit did not finish within ${timeoutMs / 1000} seconds`);
  if (run.error) return unreadable(`could not run npm: ${run.error.message}`);
  return decide(run.stdout ?? '');
}

function main(argv) {
  const inputIndex = argv.indexOf('--input');
  const rootIndex = argv.indexOf('--root');
  let rows;
  if (inputIndex !== -1) {
    const file = argv[inputIndex + 1];
    if (!file) {
      console.error('--input needs a file');
      return EXIT.UNREADABLE;
    }
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch (error) {
      console.error(`cannot read ${file}: ${error.message}`);
      return EXIT.UNREADABLE;
    }
    rows = [{ name: file, result: decide(raw) }];
  } else {
    if (rootIndex !== -1 && !argv[rootIndex + 1]) {
      console.error('--root needs a directory');
      return EXIT.UNREADABLE;
    }
    const root = rootIndex !== -1 ? resolve(argv[rootIndex + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
    let packages;
    try {
      packages = discoverPackages(root);
    } catch (error) {
      console.error(`cannot read ${root}: ${error.message}`);
      return EXIT.UNREADABLE;
    }
    if (packages.length === 0) {
      console.error(`no package with a package-lock.json found one level below ${root}`);
      return EXIT.UNREADABLE;
    }
    rows = packages.map((name) => ({ name, result: auditPackage(resolve(root, name)) }));
  }

  console.log(formatTable(rows));
  const vulnerable = formatVulnerable(rows);
  if (vulnerable) console.log(vulnerable);
  const code = exitCodeFor(rows.map((r) => r.result));
  console.log(code === EXIT.PASS ? '\nAudit gate: pass' : '\nAudit gate: FAIL');
  return code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
