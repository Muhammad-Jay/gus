import type { RepositoryChange } from './repository-change.js';
import type { RepositorySnapshot } from './repository-snapshot.js';

function changeKey(change: RepositoryChange): string {
  return JSON.stringify([
    change.path,
    change.oldPath ?? null,
    change.status,
    change.stagingState,
    change.hasStagedChanges ?? false,
    change.hasUnstagedChanges ?? false,
  ]);
}

/**
 * Compares two repository snapshots and reports whether the repository state differs.
 *
 * The comparison covers the branch, the `HEAD` commit, the index fingerprint, the worktree
 * fingerprint, and the change metadata. Fingerprints make content-only edits detectable even when
 * the affected paths and their statuses stay identical.
 */
export function hasRepositoryStateChanged(
  before: RepositorySnapshot,
  after: RepositorySnapshot,
): boolean {
  if (before.currentBranch !== after.currentBranch) {
    return true;
  }

  if (before.headSha !== after.headSha) {
    return true;
  }

  if (before.indexFingerprint !== after.indexFingerprint) {
    return true;
  }

  if (before.worktreeFingerprint !== after.worktreeFingerprint) {
    return true;
  }

  const beforeChanges = new Set(before.changes.map(changeKey));
  const afterChanges = new Set(after.changes.map(changeKey));

  if (beforeChanges.size !== afterChanges.size) {
    return true;
  }

  for (const key of beforeChanges) {
    if (!afterChanges.has(key)) {
      return true;
    }
  }

  return false;
}
