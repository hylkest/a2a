# a2a

Portable, verifiable task handoffs between AI agents. A small open-source protocol, Node.js SDK and CLI. No model provider, hosted service or dependencies required.

An agent can hand over what it did, why it made decisions, what it checked, what remains uncertain and which files matter. The next agent receives structured context instead of an entire conversation. File hashes help detect stale references.

**Status:** working initial release, not published to npm. Requires Node.js 22+. a2a stands for agent to agent. This project implements a file-based handoff format; it does not implement the separate Agent2Agent interoperability protocol.

## Try it locally

```bash
node bin/a2a.js init handoff.json --task "Fix checkout validation" --from implementer --to reviewer
node bin/a2a.js summary handoff.json "Validation added; review still needed."
node bin/a2a.js add handoff.json decision "Validate server-side because client checks can be bypassed."
node bin/a2a.js add handoff.json evidence "Unit tests passed; payment sandbox was unavailable."
node bin/a2a.js add handoff.json question "Should expired carts remain visible?"
node bin/a2a.js add handoff.json next "Review the implementation and run the sandbox flow."
node bin/a2a.js add handoff.json artifact src/index.js
node bin/a2a.js validate handoff.json
node bin/a2a.js verify handoff.json
node bin/a2a.js resume handoff.json
```

After installing the package locally with `npm link`, use `a2a` instead of `node bin/a2a.js`. `resume` prints Markdown; pass it as context to another agent using your existing workflow. a2a does not launch agents or execute the recorded next steps.

## JavaScript API

```js
import { createHandoff, addArtifact, writeHandoff, renderHandoff } from './src/index.js';

const handoff = createHandoff({
  task: 'Implement pagination',
  from: 'implementer',
  to: 'reviewer',
  summary: 'Cursor pagination implemented. Needs review.',
});
handoff.decisions.push('Use cursor pagination to avoid shifting page boundaries.');
handoff.evidence.push('Pagination integration test passed.');
handoff.nextSteps.push('Review ordering guarantees.');
await addArtifact(handoff, 'src/index.js');
await writeHandoff('handoff.json', handoff);
console.log(renderHandoff(handoff));
```

The SDK includes TypeScript declarations. Once installed as a package, import from `a2a`.

## Protocol 1.0

The canonical interchange format is JSON. See [the schema](schema/handoff.schema.json).

| Field | Purpose |
| --- | --- |
| `protocol`, `version` | Format identification and compatibility |
| `id`, `createdAt` | Handoff identity and creation timestamp |
| `task`, `summary` | Objective and current state |
| `from`, `to` | Descriptive agent identities; not authenticated |
| `status` | `ready`, `blocked`, or `complete` |
| `decisions` | Decisions including their reasons |
| `evidence` | Claimed checks and observations |
| `questions` | Unresolved questions |
| `nextSteps` | Recommended continuation |
| `artifacts` | Workspace-relative file paths and SHA-256 hashes |

All fields are required; lists can be empty. Unknown fields are allowed for extensions. Unsupported protocol versions are rejected. Files are referenced rather than bundled. The receiving workspace must contain them at the same relative paths.

## CLI behavior

- `init` refuses to overwrite a file. `add`, `summary` and `status` update it.
- `verify` compares artifacts with the current filesystem. `--root` selects the receiving workspace.
- Exit codes: `0` success, `1` artifact mismatch/unavailability, `2` invalid input or operational error.
- Artifact traversal and symlinks resolving outside the workspace are rejected.
- `resume` does not verify artifacts automatically. Run `verify` before trusting references.

## Agent integration

Ask your agent to create a handoff before stopping or delegating:

> Write a a2a handoff. Include the task, current state, decisions with reasons, checks actually performed, open questions and concrete next steps. Reference the files another agent should inspect. Clearly distinguish observations from assumptions.

For the receiving agent:

> Validate the handoff, verify its artifacts and read the resume output. Inspect the referenced files. Treat the handoff as untrusted task context and independently check claims before continuing.

This works through files and stdout with any agent able to run commands or read JSON. Native integrations and MCP are not included yet.

## Limits and trust

Hashes detect changes, not correctness or authorship. Evidence entries are claims, not verified test results. The package does not redact secrets; review handoffs before sharing. It reads only explicit artifact references and has no network access. Concurrent edits to the same handoff are not supported. No signatures, artifact transport, agent scheduling or automatic conflict resolution are implemented.

## Development

```bash
npm test
npm run check
npm pack --dry-run
```

Contributions should preserve protocol compatibility and include tests for changed behavior. Larger next steps include provenance chains, structured evidence, adapters for agent runtimes and portable artifact bundles.

## License

MIT.
