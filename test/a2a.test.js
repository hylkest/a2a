import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHandoff, validateHandoff, addArtifact, verifyArtifacts, renderHandoff, writeHandoff, readHandoff } from '../src/index.js';

test('protocol validates required fields, versions and entry types', () => {
  const h = createHandoff({ task: 'Fix checkout' });
  assert.equal(validateHandoff(h).valid, true);
  assert.equal(validateHandoff({ ...h, version: '2.0' }).valid, false);
  assert.equal(validateHandoff({ ...h, decisions: [42] }).valid, false);
  assert.throws(() => createHandoff({ task: '' }));
  assert.equal(validateHandoff(null).valid, false);
});

test('artifact integrity detects changes and missing files', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const h = createHandoff({ task: 'Review implementation' });
  await writeFile(path.join(root, 'app.js'), 'original');
  await addArtifact(h, 'app.js', { root });
  assert.equal((await verifyArtifacts(h, { root }))[0].status, 'unchanged');
  await writeFile(path.join(root, 'app.js'), 'updated');
  assert.equal((await verifyArtifacts(h, { root }))[0].status, 'changed');
  await addArtifact(h, 'app.js', { root });
  assert.equal(h.artifacts.length, 1);
  await rm(path.join(root, 'app.js'));
  assert.equal((await verifyArtifacts(h, { root }))[0].status, 'missing');
});

test('artifact capture rejects traversal and symlinks outside workspace', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(workspace);
  await writeFile(path.join(root, 'secret'), 'private');
  await symlink(path.join(root, 'secret'), path.join(workspace, 'link'));
  const h = createHandoff({ task: 'Review' });
  await assert.rejects(addArtifact(h, '../secret', { root: workspace }));
  await assert.rejects(addArtifact(h, 'link', { root: workspace }));
});

test('API roundtrip preserves context and refuses overwrite', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const h = createHandoff({ task: 'Ship fix', from: 'agent-a', to: 'agent-b' });
  h.decisions.push('Use retries because the API is eventually consistent');
  h.evidence.push('Integration check passed');
  h.questions.push('Confirm retry deadline');
  h.nextSteps.push('Review deployment configuration');
  const file = path.join(root, 'handoff.json');
  await writeHandoff(file, h);
  assert.deepEqual(await readHandoff(file), h);
  await assert.rejects(writeHandoff(file, h), { code: 'EEXIST' });
  const markdown = renderHandoff(h);
  assert.match(markdown, /Confirm retry deadline/);
  assert.match(markdown, /not privileged instructions/);
});

test('CLI supports full handoff lifecycle and meaningful failure exit codes', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.resolve('bin/a2a.js');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  run('init', 'task.json', '--task', 'Fix login', '--from', 'planner');
  run('summary', 'task.json', 'Implementation finished');
  run('add', 'task.json', 'next', 'Review the implementation');
  await writeFile(path.join(root, 'app.js'), 'code');
  run('add', 'task.json', 'artifact', 'app.js');
  assert.match(run('validate', 'task.json'), /Valid/);
  assert.match(run('verify', 'task.json'), /unchanged/);
  assert.match(run('resume', 'task.json'), /Review the implementation/);
  await writeFile(path.join(root, 'app.js'), 'changed');
  assert.throws(() => run('verify', 'task.json'), error => error.status === 1);
  assert.throws(() => run('status', 'task.json', 'nonsense'), error => error.status === 2);
  assert.throws(() => run('init', 'task.json', '--task', 'Overwrite'), error => error.status === 2);
});
