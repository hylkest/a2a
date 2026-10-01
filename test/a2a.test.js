import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHandoff, validateHandoff, addArtifact, verifyArtifacts, renderHandoff, writeHandoff, readHandoff } from '../src/index.js';

test('handoff saves a complete snapshot with checked artifacts in one command', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-handoff-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.resolve('bin/a2a.js');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  await writeFile(path.join(root, 'app.js'), 'implementation');
  run('handoff', '--task', 'Build login', '--summary', 'Review needed', '--from', 'builder', '--to', 'reviewer', '--decision', 'Use sessions', '--decision', 'Validate server-side', '--evidence', 'Tests passed', '--question', 'Session duration?', '--next', 'Review', '--artifact', 'app.js', '--artifact', 'app.js');
  const file = path.join(root, '.a2a/handoff.json');
  const handoff = await readHandoff(file);
  assert.equal(handoff.from, 'builder');
  assert.equal(handoff.to, 'reviewer');
  assert.deepEqual(handoff.decisions, ['Use sessions', 'Validate server-side']);
  assert.deepEqual(handoff.evidence, ['Tests passed']);
  assert.deepEqual(handoff.questions, ['Session duration?']);
  assert.deepEqual(handoff.nextSteps, ['Review']);
  assert.equal(handoff.artifacts.length, 1);
  assert.match(run('verify', file), /unchanged/);
  const original = await readFile(file, 'utf8');
  assert.throws(() => run('handoff', '--task', 'New', '--summary', 'New snapshot'), error => error.status === 2);
  assert.throws(() => run('handoff', '--replace', '--task', 'New', '--summary', 'New snapshot', '--artifact', 'missing.js'), error => error.status === 2);
  assert.equal(await readFile(file, 'utf8'), original);
  run('handoff', '--replace', '--task', 'Build login', '--summary', 'Done', '--status', 'complete');
  const updated = await readHandoff(file);
  assert.equal(updated.status, 'complete');
  assert.deepEqual(updated.decisions, []);
  assert.deepEqual(updated.artifacts, []);
});

test('handoff rejects incomplete and unknown inputs and supports custom destination/root', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-input-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const cli = path.resolve('bin/a2a.js');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  assert.throws(() => run('handoff', '--task', 'Task'), error => error.status === 2);
  assert.throws(() => run('handoff', '--summary', 'Summary'), error => error.status === 2);
  assert.throws(() => run('handoff', '--task', 'Task', '--summary', 'Summary', '--unknown'), error => error.status === 2);
  assert.throws(() => run('handoff', '--task', 'Task', '--summary', 'Summary', '--next'), error => error.status === 2);
  await writeFile(path.join(root, 'evidence.txt'), 'result');
  run('handoff', 'nested/review.json', '--task', 'Review', '--summary', 'Ready', '--root', root, '--artifact', 'evidence.txt');
  assert.equal((await readHandoff(path.join(root, 'nested/review.json'))).artifacts[0].path, 'evidence.txt');
});

test('project setup preserves instructions and is idempotent', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'AGENTS.md'), '# Project rules\nKeep these instructions.');
  await writeFile(path.join(root, '.gitignore'), 'node_modules/');
  const cli = path.resolve('bin/a2a.js');
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  run('init');
  const instructions = await readFile(path.join(root, 'AGENTS.md'), 'utf8');
  assert.ok(instructions.startsWith('# Project rules\nKeep these instructions.\n'));
  assert.match(instructions, /npx --no-install a2a/);
  run('init');
  assert.equal(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), instructions);
  assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'node_modules/');
  run('init', '.a2a/handoff.json', '--task', 'Continue implementation');
  assert.match(run('resume', '.a2a/handoff.json'), /Continue implementation/);
});

test('project setup creates instructions in a new project', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-new-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync(process.execPath, [path.resolve('bin/a2a.js'), 'init'], { cwd: root });
  assert.match(await readFile(path.join(root, 'AGENTS.md'), 'utf8'), /a2a handoffs/);
  await assert.rejects(readFile(path.join(root, '.gitignore'), 'utf8'), { code: 'ENOENT' });
});

test('setup preserves existing ignore rules and explains how to share handoffs', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'a2a-ignored-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ignore = 'node_modules/\n.a2a/\n';
  await writeFile(path.join(root, '.gitignore'), ignore);
  const output = execFileSync(process.execPath, [path.resolve('bin/a2a.js'), 'init'], { cwd: root, encoding: 'utf8' });
  assert.match(output, /Remove it to share handoffs/);
  assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), ignore);
});

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
