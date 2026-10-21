import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, exitCodeFor, formatTable, EXIT } from './audit-gate.mjs';

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
