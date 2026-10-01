# Changelog

User-facing changes to a2a are recorded here. New changes belong under
**Unreleased** until a release is published. Package and handoff protocol
versions are independent.
The next planned package release is `0.3.0`.

## [Unreleased]

### Added

- `a2a --version` displays the installed package version from any directory.
- Handoffs capture Git branch, commit and dirty state when available. Resume
  compares the current checkout and highlights differences and uncommitted work.
- This changelog to track user-facing changes and release notes.

### Fixed

- Re-running `a2a init` now refreshes existing agent instructions while preserving
  project rules outside the managed block. Invalid or duplicate block markers
  are rejected without modifying the file.

### Changed

- Package metadata updated to version `0.2.0` to match the published release.

## [0.2.0]

### Added

- Project setup through `a2a init`, with agent instructions in `AGENTS.md`.
- Single-command handoff creation with task, summary, optional context and
  automatically hashed artifact references.
- Explicit `--replace` support for saving a complete replacement handoff.
- Installation instructions for GitHub dependencies and npm-free local clones.

### Changed

- Project setup no longer adds `.a2a/` to `.gitignore`, allowing reviewed
  handoffs to be committed and shared with teammates.
- Existing ignore rules are preserved; setup explains how to remove explicit
  `.a2a` rules when sharing handoffs.

## [0.1.0] — Initial implementation

This section describes the initial package baseline, not a published release.

### Added

- Version 1.0 of the JSON handoff protocol for tasks, summaries, agent labels,
  decisions, evidence, questions, next steps and artifact references.
- Node.js SDK with TypeScript declarations and a JSON Schema.
- CLI commands to create, edit, validate, verify and render handoffs.
- SHA-256 artifact checks for changed, missing or unavailable files.
- Workspace boundary checks for artifact paths and symlinks.
- Automated tests, documentation and the MIT license.
