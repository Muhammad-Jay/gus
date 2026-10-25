import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  OperationFailedError,
  UnsafeRepositoryStateError,
} from '../../../src/domain/errors/domain-errors';
import { ProcessRunner } from '../../../src/infrastructure/process/process-runner';
import { GitRepositoryAdapter } from '../../../src/infrastructure/repository/providers/git-cli/git-repository.adapter';
import { FakeProcessRunner, createProcessRunResult } from '../../helpers/process-runner-fake';
import type { StagedPath } from '../../../src/domain/workflow/commit-group';

describe('GitRepositoryAdapter', () => {
  let tempDir: string;
  let adapter: GitRepositoryAdapter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'gus-test-'));
    const processRunner = new ProcessRunner();
    adapter = new GitRepositoryAdapter(processRunner);

    // Initialize git repo
    await execa('git', ['init'], { cwd: tempDir });
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should detect a git repository', async () => {
    const location = await adapter.detect(tempDir);
    expect(location).not.toBeNull();
    expect(location?.rootPath).toBe(tempDir);
  });

  it('should return null for non-git directory', async () => {
    const nonGitDir = await mkdtemp(join(tmpdir(), 'gus-non-git-'));
    const location = await adapter.detect(nonGitDir);
    expect(location).toBeNull();
    await rm(nonGitDir, { recursive: true, force: true });
  });

  it('should inspect empty repository', async () => {
    await adapter.detect(tempDir);
    const snapshot = await adapter.inspect();
    expect(snapshot.rootPath).toBe(tempDir);
    expect(snapshot.changes).toEqual([]);
  });

  it('should detect untracked files', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await adapter.detect(tempDir);
    const snapshot = await adapter.inspect();
    expect(snapshot.changes.length).toBe(1);
    expect(snapshot.changes[0].path).toBe('test.txt');
    expect(snapshot.changes[0].stagingState).toBe('untracked');
  });

  it('should stage and commit files', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await adapter.detect(tempDir);
    await adapter.stagePaths([{ path: 'test.txt' }] as StagedPath[]);
    const result = await adapter.commit('initial commit');
    expect(result.sha).toBeTruthy();
    expect(result.message).toBe('initial commit');
  });

  it('create branch integration: validateBranchName accepts it, branchExists returns true, createBranch with same name fails', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await execa('git', ['add', '.'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'initial'], { cwd: tempDir });
    await adapter.detect(tempDir);
    await expect(adapter.validateBranchName('feature/integration')).resolves.toBeUndefined();
    await adapter.createBranch('feature/integration');
    await expect(adapter.branchExists('feature/integration')).resolves.toBe(true);
    await expect(adapter.createBranch('feature/integration')).rejects.toBeInstanceOf(
      OperationFailedError,
    );
  });

  it('should refuse to inspect a repository with a merge in progress', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await writeFile(
      join(tempDir, '.git', 'MERGE_HEAD'),
      '0000000000000000000000000000000000000000\n',
    );
    await adapter.detect(tempDir);
    await expect(adapter.inspect()).rejects.toThrow(UnsafeRepositoryStateError);
    await expect(adapter.inspect()).rejects.toThrow('merge');
  });

  it('should refuse to inspect a repository with a revert in progress', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await writeFile(
      join(tempDir, '.git', 'REVERT_HEAD'),
      '0000000000000000000000000000000000000000\n',
    );
    await adapter.detect(tempDir);
    await expect(adapter.inspect()).rejects.toThrow(UnsafeRepositoryStateError);
    await expect(adapter.inspect()).rejects.toThrow('revert');
  });

  it('should inspect a repository with a separate git directory', async () => {
    const workTreeDir = await mkdtemp(join(tmpdir(), 'gus-separate-'));
    const separateGitDir = await mkdtemp(join(tmpdir(), 'gus-separate-git-'));
    await rm(workTreeDir, { recursive: true, force: true });
    await rm(separateGitDir, { recursive: true, force: true });

    await execa('git', ['init', `--separate-git-dir=${separateGitDir}`, workTreeDir]);
    await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: workTreeDir });
    await execa('git', ['config', 'user.name', 'Test'], { cwd: workTreeDir });
    await writeFile(join(workTreeDir, 'test.txt'), 'hello');

    const separateAdapter = new GitRepositoryAdapter(new ProcessRunner());
    await separateAdapter.detect(workTreeDir);
    const snapshot = await separateAdapter.inspect();

    expect(snapshot.rootPath).toBe(workTreeDir);
    expect(snapshot.changes).toHaveLength(1);
    expect(snapshot.changes[0].path).toBe('test.txt');

    await rm(workTreeDir, { recursive: true, force: true });
    await rm(separateGitDir, { recursive: true, force: true });
  });

  it('should inspect a linked worktree without seeing the main repository state', async () => {
    await writeFile(join(tempDir, 'test.txt'), 'hello');
    await execa('git', ['add', '.'], { cwd: tempDir });
    await execa('git', ['commit', '-m', 'initial'], { cwd: tempDir });

    const worktreeDir = await mkdtemp(join(tmpdir(), 'gus-worktree-'));
    await rm(worktreeDir, { recursive: true, force: true });
    await execa('git', ['worktree', 'add', '-b', 'feature/worktree', worktreeDir], {
      cwd: tempDir,
    });
    await writeFile(
      join(tempDir, '.git', 'MERGE_HEAD'),
      '0000000000000000000000000000000000000000\n',
    );

    const worktreeAdapter = new GitRepositoryAdapter(new ProcessRunner());
    await worktreeAdapter.detect(worktreeDir);
    const snapshot = await worktreeAdapter.inspect();

    expect(snapshot.rootPath).toBe(worktreeDir);
    expect(snapshot.currentBranch).toBe('feature/worktree');

    await rm(worktreeDir, { recursive: true, force: true });
  });

  describe('commit failures', () => {
    function createAdapterWithRunner(
      handler: (args: string[]) => ReturnType<typeof createProcessRunResult>,
    ): GitRepositoryAdapter {
      const runner = new FakeProcessRunner((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
          return createProcessRunResult({ stdout: tempDir });
        }
        return handler(args);
      });
      return new GitRepositoryAdapter(runner);
    }

    it('should fail when the commit SHA cannot be read after a successful commit', async () => {
      const adapter = createAdapterWithRunner((args) => {
        if (args[0] === 'commit') {
          return createProcessRunResult({ exitCode: 0 });
        }
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
          return createProcessRunResult({
            exitCode: 128,
            stderr: 'fatal: bad revision HEAD',
            failureReason: 'Command failed with exit code 128: git rev-parse HEAD',
          });
        }
        return createProcessRunResult();
      });
      await adapter.detect(tempDir);

      await expect(adapter.commit('initial commit')).rejects.toBeInstanceOf(OperationFailedError);
      await expect(adapter.commit('initial commit')).rejects.toThrow('fatal: bad revision HEAD');
      await expect(adapter.commit('initial commit')).rejects.toThrow('exited with code 128');
    });

    it('should fail when the commit SHA is empty', async () => {
      const adapter = createAdapterWithRunner((args) => {
        if (args[0] === 'commit') {
          return createProcessRunResult({ exitCode: 0 });
        }
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
          return createProcessRunResult({ stdout: '   \n' });
        }
        return createProcessRunResult();
      });
      await adapter.detect(tempDir);

      await expect(adapter.commit('initial commit')).rejects.toBeInstanceOf(OperationFailedError);
      await expect(adapter.commit('initial commit')).rejects.toThrow('empty SHA');
    });

    it('should report a commit command that was terminated by a signal', async () => {
      const adapter = createAdapterWithRunner((args) => {
        if (args[0] === 'commit') {
          return createProcessRunResult({
            exitCode: null,
            signal: 'SIGTERM',
            signalDescription: 'Termination',
            isTerminated: true,
            failureReason: 'Command was killed with SIGTERM (Termination): git commit',
          });
        }
        return createProcessRunResult();
      });
      await adapter.detect(tempDir);

      await expect(adapter.commit('initial commit')).rejects.toBeInstanceOf(OperationFailedError);
      await expect(adapter.commit('initial commit')).rejects.toThrow('terminated by SIGTERM');
    });

    it('should report a commit command that could not be started', async () => {
      const adapter = createAdapterWithRunner((args) => {
        if (args[0] === 'commit') {
          return createProcessRunResult({
            exitCode: null,
            spawnFailed: true,
            failureReason: 'Command failed with ENOENT: git',
          });
        }
        return createProcessRunResult();
      });
      await adapter.detect(tempDir);

      await expect(adapter.commit('initial commit')).rejects.toBeInstanceOf(OperationFailedError);
      await expect(adapter.commit('initial commit')).rejects.toThrow('could not be started');
    });
  });

  describe('staging with StagedPath (renames and index verification)', () => {
    it('should stage a renamed file with oldPath and newPath', async () => {
      await writeFile(join(tempDir, 'old-name.txt'), 'original content');
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      // Rename the file
      await execa('git', ['mv', 'old-name.txt', 'new-name.txt'], { cwd: tempDir });

      await adapter.detect(tempDir);
      await adapter.stagePaths([{ path: 'new-name.txt', oldPath: 'old-name.txt' }] as StagedPath[]);

      const stagedPaths = await adapter.getStagedPaths();
      expect(stagedPaths).toEqual(['new-name.txt']);

      const result = await adapter.commit('rename file');
      expect(result.message).toBe('rename file');
    });

    it('should stage multiple files including renames', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      await writeFile(join(tempDir, 'old-name.txt'), 'content2');
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      // Modify file1.txt so it has changes to stage
      await writeFile(join(tempDir, 'file1.txt'), 'content1 modified');
      await execa('git', ['mv', 'old-name.txt', 'renamed.txt'], { cwd: tempDir });
      await writeFile(join(tempDir, 'file3.txt'), 'content3');

      await adapter.detect(tempDir);
      await adapter.stagePaths([
        { path: 'file1.txt' } as StagedPath,
        { path: 'renamed.txt', oldPath: 'old-name.txt' } as StagedPath,
        { path: 'file3.txt' } as StagedPath,
      ]);

      const stagedPaths = await adapter.getStagedPaths();
      expect(stagedPaths.sort()).toEqual(['file1.txt', 'file3.txt', 'renamed.txt'].sort());

      const result = await adapter.commit('multiple changes');
      expect(result.message).toBe('multiple changes');
    });

    it('should fail index verification when unexpected paths are staged', async () => {
      await writeFile(join(tempDir, 'file1.txt'), 'content1');
      await writeFile(join(tempDir, 'file2.txt'), 'content2');
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      await writeFile(join(tempDir, 'file3.txt'), 'content3');
      // Manually stage file3.txt to simulate unexpected staged changes
      await execa('git', ['add', 'file3.txt'], { cwd: tempDir });

      await adapter.detect(tempDir);
      // Try to stage only file1.txt - should fail because file3.txt is already staged
      await expect(adapter.stagePaths([{ path: 'file1.txt' }] as StagedPath[])).rejects.toThrow(
        OperationFailedError,
      );
      await expect(adapter.stagePaths([{ path: 'file1.txt' }] as StagedPath[])).rejects.toThrow(
        'Unexpected staged paths: file3.txt',
      );
    });

    it('getStagedPaths returns new path for renamed file', async () => {
      await writeFile(join(tempDir, 'old.txt'), 'content');
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'initial'], { cwd: tempDir });

      await execa('git', ['mv', 'old.txt', 'new.txt'], { cwd: tempDir });

      await adapter.detect(tempDir);
      const staged = await adapter.getStagedPaths();
      expect(staged).toEqual(['new.txt']);
    });
  });
});