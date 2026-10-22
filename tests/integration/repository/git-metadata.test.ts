import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProcessRunner } from '../../../src/infrastructure/process/process-runner';
import { GitCommandRunner } from '../../../src/infrastructure/repository/providers/git-cli/git-command-runner';
import { GitMetadataResolver } from '../../../src/infrastructure/repository/providers/git-cli/git-metadata';

describe('GitMetadataResolver', () => {
  let baseDir: string;
  let repoDir: string;
  let worktreeDir: string;
  let resolver: GitMetadataResolver;

  beforeEach(async () => {
    baseDir = mkdtempSync(join(tmpdir(), 'gus-git-metadata-'));
    repoDir = join(baseDir, 'repo');
    worktreeDir = join(baseDir, 'worktree');
    mkdirSync(repoDir);

    resolver = new GitMetadataResolver(new GitCommandRunner(new ProcessRunner()));

    await execa('git', ['init'], { cwd: repoDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    writeFileSync(join(repoDir, 'README.md'), '# test repository\n');
    await execa('git', ['add', 'README.md'], { cwd: repoDir });
    await execa('git', ['commit', '-m', 'initial commit'], { cwd: repoDir });
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  describe('resolveGitDir', () => {
    it('should return the git directory of a normal repository', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);

      expect(isAbsolute(gitDir)).toBe(true);
      expect(gitDir).toBe(realpathSync(join(repoDir, '.git')));
    });

    it('should return the worktree specific git directory for a linked worktree', async () => {
      await execa('git', ['worktree', 'add', worktreeDir, '-b', 'feature/x'], { cwd: repoDir });

      const mainGitDir = await resolver.resolveGitDir(repoDir);
      const worktreeGitDir = await resolver.resolveGitDir(worktreeDir);

      expect(worktreeGitDir).not.toBe(mainGitDir);
      expect(worktreeGitDir).toContain('worktrees');
      expect(worktreeGitDir).toBe(join(mainGitDir, 'worktrees', 'worktree'));
      expect(statSync(join(worktreeDir, '.git')).isFile()).toBe(true);
    });
  });

  describe('resolveGitPath', () => {
    it('should return an absolute path inside the git directory', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);

      const path = await resolver.resolveGitPath(repoDir, 'MERGE_HEAD');

      expect(isAbsolute(path)).toBe(true);
      expect(path).toBe(join(gitDir, 'MERGE_HEAD'));
    });

    it('should resolve state files of a linked worktree inside the worktree git directory', async () => {
      await execa('git', ['worktree', 'add', worktreeDir, '-b', 'feature/x'], { cwd: repoDir });

      const mainGitDir = await resolver.resolveGitDir(repoDir);
      const worktreeGitDir = await resolver.resolveGitDir(worktreeDir);
      const path = await resolver.resolveGitPath(worktreeDir, 'MERGE_HEAD');

      expect(path).toBe(join(worktreeGitDir, 'MERGE_HEAD'));
      expect(path).not.toBe(join(mainGitDir, 'MERGE_HEAD'));
    });
  });

  describe('detectInProgressOperation', () => {
    it('should return null for a clean repository', async () => {
      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBeNull();
    });

    it('should detect a merge in progress', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);
      writeFileSync(join(gitDir, 'MERGE_HEAD'), 'a1b2c3d4\n');

      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBe('merge');
    });

    it('should detect a rebase in progress', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);
      mkdirSync(join(gitDir, 'rebase-merge'));

      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBe('rebase');
    });

    it('should detect a cherry-pick in progress', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);
      writeFileSync(join(gitDir, 'CHERRY_PICK_HEAD'), 'a1b2c3d4\n');

      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBe('cherry-pick');
    });

    it('should detect a revert in progress', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);
      writeFileSync(join(gitDir, 'REVERT_HEAD'), 'a1b2c3d4\n');

      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBe('revert');
    });

    it('should detect an active sequencer', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);
      mkdirSync(join(gitDir, 'sequencer'));

      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBe('sequencer');
    });

    it('should prefer merge over other in-progress operations', async () => {
      const gitDir = await resolver.resolveGitDir(repoDir);
      writeFileSync(join(gitDir, 'MERGE_HEAD'), 'a1b2c3d4\n');
      mkdirSync(join(gitDir, 'rebase-merge'));

      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBe('merge');
    });

    it('should detect state files of a linked worktree separately from the main repository', async () => {
      await execa('git', ['worktree', 'add', worktreeDir, '-b', 'feature/x'], { cwd: repoDir });
      const worktreeGitDir = await resolver.resolveGitDir(worktreeDir);
      writeFileSync(join(worktreeGitDir, 'MERGE_HEAD'), 'a1b2c3d4\n');

      await expect(resolver.detectInProgressOperation(worktreeDir)).resolves.toBe('merge');
      await expect(resolver.detectInProgressOperation(repoDir)).resolves.toBeNull();
    });
  });

  describe('branchExists', () => {
    it('should return true for an existing branch', async () => {
      await execa('git', ['branch', 'feature/x'], { cwd: repoDir });

      await expect(resolver.branchExists(repoDir, 'feature/x')).resolves.toBe(true);
    });

    it('should return false for a missing branch', async () => {
      await expect(resolver.branchExists(repoDir, 'feature/missing')).resolves.toBe(false);
    });

    it('should return false for a branch that exists only in a linked worktree checkout', async () => {
      await execa('git', ['worktree', 'add', worktreeDir, '-b', 'feature/x'], { cwd: repoDir });

      await expect(resolver.branchExists(repoDir, 'feature/x')).resolves.toBe(true);
      await expect(resolver.branchExists(repoDir, 'feature/missing')).resolves.toBe(false);
    });
  });
});
