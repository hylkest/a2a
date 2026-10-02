export interface Artifact { path: string; sha256: string }
export interface GitContext { branch: string | null; commit: string | null; dirty: boolean }
export interface Handoff {
  protocol: 's2s'; version: '1.0'; id: string; createdAt: string;
  task: string; summary: string; from: string; to: string;
  status: 'ready' | 'blocked' | 'complete';
  decisions: string[]; evidence: string[]; questions: string[];
  nextSteps: string[]; artifacts: Artifact[];
  git?: GitContext;
}
export const PROTOCOL_VERSION: '1.0';
export function captureGitContext(options?: { root?: string }): Promise<GitContext | null>;
export function createHandoff(options: { task: string; summary?: string; from?: string; to?: string; status?: Handoff['status'] }): Handoff;
export function validateHandoff(value: unknown): { valid: boolean; errors: string[] };
export function assertValid(value: unknown): Handoff;
export function addArtifact(handoff: Handoff, path: string, options?: { root?: string }): Promise<Artifact>;
export function verifyArtifacts(handoff: Handoff, options?: { root?: string }): Promise<Array<{ path: string; status: 'unchanged' | 'changed' | 'missing' | 'unavailable'; reason?: string }>>;
export function readHandoff(file: string): Promise<Handoff>;
export function writeHandoff(file: string, handoff: Handoff): Promise<void>;
export function renderHandoff(handoff: Handoff): string;
