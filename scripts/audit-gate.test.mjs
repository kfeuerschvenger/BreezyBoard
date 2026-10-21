import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPackage, decide, discoverPackages, exitCodeFor, formatTable, formatVulnerable, npmInvocation, EXIT } from './audit-gate.mjs';

const GATE = join(dirname(fileURLToPath(import.meta.url)), 'audit-gate.mjs');

/** Runs the gate as a process, the way CI does. */
const runGate = (args, env = {}) =>
  spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 60_000 });

/** A directory tree of the given package names, each with the given files, removed afterwards. */
const withTree = (layout, run) => {
  const root = mkdtempSync(join(tmpdir(), 'audit-gate-'));
  try {
    for (const [name, files] of Object.entries(layout)) {
      mkdirSync(join(root, name), { recursive: true });
      for (const file of files) writeFileSync(join(root, name, file), '{}');
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

const report = (overrides = {}) =>
  JSON.stringify({
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...overrides },
    },
  });

test('no vulnerabilities passes', () => {
  assert.equal(decide(report()).status, 'pass');
});

test('four low pass', () => {
  assert.equal(decide(report({ low: 4, total: 4 })).status, 'pass');
});

test('five low fail', () => {
  const result = decide(report({ low: 5, total: 5 }));
  assert.equal(result.status, 'fail');
  assert.match(result.reason, /5 low/);
});

test('one moderate fails', () => {
  const result = decide(report({ moderate: 1, total: 1 }));
  assert.equal(result.status, 'fail');
  assert.match(result.reason, /1 moderate/);
});

test('one high fails', () => {
  assert.equal(decide(report({ high: 1, total: 1 })).status, 'fail');
});

test('one critical fails', () => {
  assert.equal(decide(report({ critical: 1, total: 1 })).status, 'fail');
});

test('info advisories do not count', () => {
  assert.equal(decide(report({ info: 9, total: 9 })).status, 'pass');
});

test('output that is not JSON is unreadable', () => {
  assert.equal(decide('npm ERR! something').status, 'unreadable');
  assert.equal(decide('').status, 'unreadable');
});

test('JSON that is not an audit report is unreadable', () => {
  assert.equal(decide('null').status, 'unreadable');
  assert.equal(decide('[]').status, 'unreadable');
  assert.equal(decide('{}').status, 'unreadable');
  assert.equal(decide('{"metadata":{}}').status, 'unreadable');
});

test('a missing or non numeric count is unreadable, never a pass', () => {
  const missing = JSON.stringify({ metadata: { vulnerabilities: { low: 0, moderate: 0, high: 0, critical: 0 } } });
  assert.equal(decide(missing).status, 'unreadable');
  const text = JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: '0', moderate: 0, high: 0, critical: 0 } } });
  assert.equal(decide(text).status, 'unreadable');
});

test('a registry or network error is unreadable', () => {
  const error = JSON.stringify({ error: { code: 'ENOTFOUND', summary: 'audit endpoint unreachable', detail: '' } });
  const result = decide(error);
  assert.equal(result.status, 'unreadable');
  assert.match(result.reason, /unreachable/);
});

test('exit code: unreadable beats fail beats pass', () => {
  assert.equal(exitCodeFor([{ status: 'pass' }, { status: 'pass' }]), EXIT.PASS);
  assert.equal(exitCodeFor([{ status: 'pass' }, { status: 'fail' }]), EXIT.FAILED);
  assert.equal(exitCodeFor([{ status: 'fail' }, { status: 'unreadable' }]), EXIT.UNREADABLE);
});

test('the table names every package and its result', () => {
  const table = formatTable([
    { name: 'back', result: decide(report()) },
    { name: 'front', result: decide(report({ moderate: 2, total: 2 })) },
    { name: 'e2e', result: decide('garbage') },
  ]);
  assert.match(table, /back\s+0\s+0\s+0\s+0\s+pass/);
  assert.match(table, /front.*FAIL: 2 moderate/);
  assert.match(table, /e2e\s+-.*UNREADABLE/);
});

const withAdvisories = (counts, vulnerabilities) => {
  const parsed = JSON.parse(report(counts));
  parsed.vulnerabilities = vulnerabilities;
  return JSON.stringify(parsed);
};

test('a failing report names its vulnerable packages with their severity, the worst first', () => {
  const result = decide(
    withAdvisories(
      { moderate: 1, high: 1, total: 2 },
      { lodash: { severity: 'moderate' }, minimist: { severity: 'high' }, quiet: { severity: 'info' } }
    )
  );

  assert.deepEqual(result.vulnerable, [
    { name: 'minimist', severity: 'high' },
    { name: 'lodash', severity: 'moderate' },
  ]);

  const text = formatVulnerable([{ name: 'back', result }]);
  assert.match(text, /Vulnerable packages in back/);
  assert.match(text, /high\s+minimist/);
  assert.match(text, /moderate\s+lodash/);
  assert.doesNotMatch(text, /quiet/);
});

test('a passing package prints no vulnerable list, and a report without one still fails', () => {
  assert.equal(formatVulnerable([{ name: 'back', result: decide(report()) }]), '');

  const result = decide(report({ high: 1, total: 1 }));
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.vulnerable, []);
});

test('the packages are the directories with a package-lock.json, node_modules and the rest excluded', () => {
  const found = withTree(
    {
      front: ['package-lock.json'],
      back: ['package-lock.json', 'package.json'],
      tools: ['package-lock.json'],
      docs: ['README.md'],
      node_modules: ['package-lock.json'],
      'back/nested': ['package-lock.json'],
    },
    discoverPackages
  );

  assert.deepEqual(found, ['back', 'front', 'tools']);
});

test('the repository root yields back, front and e2e', () => {
  const found = discoverPackages(join(dirname(GATE), '..'));

  for (const name of ['back', 'front', 'e2e']) assert.ok(found.includes(name), `${name} is audited`);
  assert.deepEqual(found, [...found].sort());
});

test('npm is run through node and its entry script when one can be found, and plain npm otherwise', () => {
  const entry = join('npm-home', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const only = (...present) => (path) => present.includes(path);
  const base = { execPath: 'node-bin', separator: ';' };

  const fromEnv = npmInvocation({ ...base, env: { npm_execpath: 'launcher/npm-cli.js', PATH: 'npm-home' }, exists: only('launcher/npm-cli.js', entry) });
  assert.deepEqual(fromEnv, { command: 'node-bin', args: ['launcher/npm-cli.js'] });

  const fromPath = npmInvocation({ ...base, env: { PATH: `elsewhere;npm-home` }, exists: only(entry) });
  assert.deepEqual(fromPath, { command: 'node-bin', args: [entry] });

  const windowsCase = npmInvocation({ ...base, env: { Path: 'npm-home' }, exists: only(entry) });
  assert.deepEqual(windowsCase, { command: 'node-bin', args: [entry] });

  const notJs = npmInvocation({ ...base, env: { npm_execpath: 'launcher/npm.cmd', PATH: '' }, exists: () => true });
  assert.deepEqual(notJs, { command: 'npm', args: [] });

  assert.deepEqual(npmInvocation({ ...base, env: {}, exists: () => false }), { command: 'npm', args: [] });
});

test('the invocation puts its arguments before audit and never asks for a shell', () => {
  let seen;
  auditPackage('anywhere', {
    npm: { command: 'node-bin', args: ['npm-cli.js'] },
    spawn: (command, args, options) => {
      seen = { command, args, options };
      return { status: 0, stdout: '' };
    },
  });

  assert.equal(seen.command, 'node-bin');
  assert.deepEqual(seen.args, ['npm-cli.js', 'audit', '--json']);
  assert.notEqual(seen.options.shell, true);
});

test('a process that outlives the timeout is killed and reported as unreadable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-gate-hang-'));
  try {
    const hang = join(dir, 'hang.js');
    writeFileSync(hang, 'setTimeout(() => {}, 60000);');

    const started = Date.now();
    const result = auditPackage(dir, { timeoutMs: 500, npm: { command: process.execPath, args: [hang] } });

    assert.equal(result.status, 'unreadable');
    assert.match(result.reason, /did not finish/);
    assert.ok(Date.now() - started < 15_000, 'the run was cut short');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a run that times out is unreadable, and the timeout reaches the spawned npm', () => {
  let seen;
  const timedOut = auditPackage('anywhere', {
    timeoutMs: 5000,
    spawn: (_command, _args, options) => {
      seen = options;
      return { error: Object.assign(new Error('spawnSync npm ETIMEDOUT'), { code: 'ETIMEDOUT' }), stdout: '' };
    },
  });

  assert.equal(timedOut.status, 'unreadable');
  assert.match(timedOut.reason, /did not finish within 5 seconds/);
  assert.equal(seen.timeout, 5000);
});

test('npm that cannot start, or prints no report, is unreadable', () => {
  const missing = auditPackage('anywhere', {
    spawn: () => ({ error: Object.assign(new Error('spawnSync npm ENOENT'), { code: 'ENOENT' }), stdout: null }),
  });
  assert.equal(missing.status, 'unreadable');
  assert.match(missing.reason, /could not run npm/);

  assert.equal(auditPackage('anywhere', { spawn: () => ({ status: 1, stdout: '' }) }).status, 'unreadable');
  assert.equal(auditPackage('anywhere', { spawn: () => ({ status: 0, stdout: null }) }).status, 'unreadable');
  assert.equal(auditPackage('anywhere', { spawn: () => ({ status: 0, stdout: 'not json' }) }).status, 'unreadable');
});

test('process: an --input that cannot be read exits 2', () => {
  const run = runGate(['--input', join(tmpdir(), 'audit-gate-does-not-exist.json')]);

  assert.equal(run.status, EXIT.UNREADABLE);
  assert.match(run.stderr, /cannot read/);
});

test('process: --input without a file exits 2', () => {
  assert.equal(runGate(['--input']).status, EXIT.UNREADABLE);
});

test('process: --input with a report that is not one exits 2, and a failing one exits 1 with its packages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'audit-gate-'));
  try {
    const garbage = join(dir, 'garbage.json');
    writeFileSync(garbage, 'npm ERR! offline');
    assert.equal(runGate(['--input', garbage]).status, EXIT.UNREADABLE);

    const failing = join(dir, 'failing.json');
    writeFileSync(failing, withAdvisories({ high: 1, total: 1 }, { minimist: { severity: 'high' } }));
    const run = runGate(['--input', failing]);
    assert.equal(run.status, EXIT.FAILED);
    assert.match(run.stdout, /high\s+minimist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('process: a root with no package exits 2 instead of passing on nothing', () => {
  const run = withTree({ docs: ['README.md'], node_modules: ['package-lock.json'] }, (root) => runGate(['--root', root]));

  assert.equal(run.status, EXIT.UNREADABLE);
  assert.match(run.stderr, /no package with a package-lock\.json/);
});

test('process: a root that does not exist, or --root without a value, exits 2', () => {
  assert.equal(runGate(['--root', join(tmpdir(), 'audit-gate-does-not-exist')]).status, EXIT.UNREADABLE);
  assert.equal(runGate(['--root']).status, EXIT.UNREADABLE);
});

test('process: a package whose npm is missing exits 2, never 0', () => {
  const empty = mkdtempSync(join(tmpdir(), 'audit-gate-path-'));
  try {
    const run = withTree({ tool: ['package-lock.json'] }, (root) => runGate(['--root', root], { PATH: empty, Path: empty, npm_execpath: '' }));

    assert.equal(run.status, EXIT.UNREADABLE);
    assert.match(run.stdout, /UNREADABLE/);
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});
