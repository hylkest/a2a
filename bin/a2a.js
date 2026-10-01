#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { createHandoff, addArtifact, readHandoff, renderHandoff, validateHandoff, verifyArtifacts } from '../src/index.js';

const help = `a2a — portable agent handoffs

Commands:
  init <file> --task <goal> [--from <agent>] [--to <agent>]
  add <file> <decision|evidence|question|next|artifact> <value>
  summary <file> <text>
  status <file> <ready|blocked|complete>
  validate <file>
  verify <file> [--root <workspace>]
  resume <file>

Artifact paths are relative to the current workspace.
init refuses to overwrite an existing file. resume writes Markdown to stdout.
`;
const args = process.argv.slice(2);
const command = args.shift();
function option(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`--${name} requires a value`);
  const value = args[i + 1]; args.splice(i, 2); return value;
}
async function save(file, handoff) {
  const result = validateHandoff(handoff);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  await writeFile(file, `${JSON.stringify(handoff, null, 2)}\n`);
}
try {
  if (!command || ['help', '--help', '-h'].includes(command)) console.log(help);
  else if (command === 'init') {
    const task = option('task'); const from = option('from', 'unknown'); const to = option('to', 'any');
    if (args.length !== 1) throw new Error('Usage: init <file> --task <goal>');
    const handoff = createHandoff({ task, from, to });
    await writeFile(args[0], `${JSON.stringify(handoff, null, 2)}\n`, { flag: 'wx' });
    console.log(`Created ${args[0]}`);
  } else if (command === 'validate') {
    if (args.length !== 1) throw new Error('Usage: validate <file>');
    await readHandoff(args[0]); console.log('Valid a2a 1.0 handoff');
  } else if (command === 'verify') {
    const root = option('root', process.cwd());
    if (args.length !== 1) throw new Error('Usage: verify <file> [--root <workspace>]');
    const results = await verifyArtifacts(await readHandoff(args[0]), { root });
    console.log(JSON.stringify(results, null, 2));
    if (results.some(item => item.status !== 'unchanged')) process.exitCode = 1;
  } else if (command === 'resume') {
    if (args.length !== 1) throw new Error('Usage: resume <file>');
    process.stdout.write(renderHandoff(await readHandoff(args[0])));
  } else if (['add', 'summary', 'status'].includes(command)) {
    const root = option('root', process.cwd());
    const file = args.shift(); if (!file) throw new Error('A handoff file is required');
    const handoff = await readHandoff(file);
    if (command === 'add') {
      const kind = args.shift(); const value = args.join(' ');
      if (!value.trim()) throw new Error('An entry value is required');
      const fields = { decision: 'decisions', evidence: 'evidence', question: 'questions', next: 'nextSteps' };
      if (kind === 'artifact') await addArtifact(handoff, value, { root });
      else if (fields[kind]) handoff[fields[kind]].push(value);
      else throw new Error('Unknown entry type');
    } else {
      if (!args.length) throw new Error('A value is required');
      handoff[command] = args.join(' ');
    }
    await save(file, handoff); console.log(`Updated ${file}`);
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) { console.error(`a2a: ${error.message}`); process.exitCode = 2; }
