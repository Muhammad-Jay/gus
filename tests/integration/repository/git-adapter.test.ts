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
    await adapter.stagePaths(['test.txt']);
    const result = await adapter.commit('initial commit');
    expect(result.sha).toBeTruthy();
    expect(result.message).toBe('initial commit');
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
});
