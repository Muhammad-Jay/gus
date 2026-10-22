import { describe, expect, it } from 'vitest';
import type { RepositoryChange } from '../../../../src/domain/repository/repository-change';
import type { RepositorySnapshot } from '../../../../src/domain/repository/repository-snapshot';
import { hasRepositoryStateChanged } from '../../../../src/domain/repository/snapshot-comparison';

function change(overrides: Partial<RepositoryChange> = {}): RepositoryChange {
  return {
    path: 'a.ts',
    status: 'modified',
    stagingState: 'unstaged',
    ...overrides,
  };
}

function snapshot(overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot {
  return {
    rootPath: '/repo',
    displayName: 'repo',
    currentBranch: 'main',
    isDetached: false,
    isOperationInProgress: false,
    changes: [],
    headSha: 'head-1',
    indexFingerprint: 'index-1',
    worktreeFingerprint: 'worktree-1',
    ...overrides,
  };
}

describe('hasRepositoryStateChanged', () => {
  it('reports no change for identical snapshots', () => {
    const before = snapshot({ changes: [change()] });
    const after = snapshot({ changes: [change()] });

    expect(hasRepositoryStateChanged(before, after)).toBe(false);
  });

  it('detects a different current branch', () => {
    const before = snapshot();
    const after = snapshot({ currentBranch: 'feature/other' });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a different head sha', () => {
    const before = snapshot();
    const after = snapshot({ headSha: 'head-2' });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a different index fingerprint', () => {
    const before = snapshot();
    const after = snapshot({ indexFingerprint: 'index-2' });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a different worktree fingerprint', () => {
    const before = snapshot();
    const after = snapshot({ worktreeFingerprint: 'worktree-2' });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a change that only differs in old path', () => {
    const before = snapshot({ changes: [change({ oldPath: 'old.ts' })] });
    const after = snapshot({ changes: [change({ oldPath: 'renamed-from.ts' })] });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a change that only differs in staging state', () => {
    const before = snapshot({ changes: [change({ stagingState: 'unstaged' })] });
    const after = snapshot({ changes: [change({ stagingState: 'staged' })] });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a change that only differs in has staged changes', () => {
    const before = snapshot({ changes: [change({ hasStagedChanges: false })] });
    const after = snapshot({ changes: [change({ hasStagedChanges: true })] });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a change that only differs in has unstaged changes', () => {
    const before = snapshot({ changes: [change({ hasUnstagedChanges: false })] });
    const after = snapshot({ changes: [change({ hasUnstagedChanges: true })] });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects an added change', () => {
    const before = snapshot({ changes: [change({ path: 'a.ts' })] });
    const after = snapshot({ changes: [change({ path: 'a.ts' }), change({ path: 'b.ts' })] });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects a removed change', () => {
    const before = snapshot({ changes: [change({ path: 'a.ts' }), change({ path: 'b.ts' })] });
    const after = snapshot({ changes: [change({ path: 'a.ts' })] });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });

  it('detects rename information loss for the same path and status', () => {
    const before = snapshot({
      changes: [change({ path: 'new.ts', status: 'renamed', oldPath: 'original.ts' })],
    });
    const after = snapshot({
      changes: [change({ path: 'new.ts', status: 'renamed' })],
    });

    expect(hasRepositoryStateChanged(before, after)).toBe(true);
  });
});
