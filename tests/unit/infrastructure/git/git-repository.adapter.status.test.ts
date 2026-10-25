import { describe, expect, it } from 'vitest';
import {
  InvalidBranchNameError,
  OperationFailedError,
  RepositoryInspectionError,
} from '../../../../src/domain/errors/domain-errors';
import type { StagedPath } from '../../../../src/domain/workflow/commit-group';
import { GitRepositoryAdapter } from '../../../../src/infrastructure/repository/providers/git-cli/git-repository.adapter';
import { FakeProcessRunner, createProcessRunResult } from '../../../helpers/process-runner-fake';

const REPO_ROOT = '/tmp/gus-fake-repository';
const GIT_DIR = `${REPO_ROOT}/.git`;

function createAdapter(
  handler: (args: string[]) => ReturnType<typeof createProcessRunResult>,
): GitRepositoryAdapter {
  const runner = new FakeProcessRunner((args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return createProcessRunResult({ stdout: REPO_ROOT });
    }
    if (args[0] === 'rev-parse' && args[1] === '--absolute-git-dir') {
      return createProcessRunResult({ stdout: GIT_DIR });
    }
    return handler(args);
  });
  return new GitRepositoryAdapter(runner);
}

describe('GitRepositoryAdapter.inspect', () => {
  it('requests NUL-delimited porcelain status with individual untracked files', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === 'status') {
        return createProcessRunResult({ stdout: '?? untracked.ts\0' });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    const snapshot = await adapter.inspect();

    const statusCall = calls.find((args) => args[0] === 'status');
    expect(statusCall).toEqual(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    expect(snapshot.changes).toHaveLength(1);
    expect(snapshot.changes[0].path).toBe('untracked.ts');
    expect(snapshot.changes[0].stagingState).toBe('untracked');
  });

  it('fails with a repository inspection error when the status command fails', async () => {
    const adapter = createAdapter((args) => {
      if (args[0] === 'status') {
        return createProcessRunResult({
          stderr: 'fatal: not a git repository',
          exitCode: 128,
        });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);

    await expect(adapter.inspect()).rejects.toThrow(RepositoryInspectionError);
    await expect(adapter.inspect()).rejects.toThrow('fatal: not a git repository');
  });

  it('fails with a repository inspection error when the status command cannot be started', async () => {
    const adapter = createAdapter((args) => {
      if (args[0] === 'status') {
        return createProcessRunResult({
          exitCode: null,
          spawnFailed: true,
          failureReason: 'Command failed with ENOENT: git',
        });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);

    await expect(adapter.inspect()).rejects.toThrow(RepositoryInspectionError);
    await expect(adapter.inspect()).rejects.toThrow('could not be started');
  });
});

describe('GitRepositoryAdapter.branch validation and creation', () => {
  it('validateBranchName resolves for feature/x', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === 'check-ref-format') {
        return createProcessRunResult({ exitCode: 0 });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    await expect(adapter.validateBranchName('feature/x')).resolves.toBeUndefined();

    const checkCall = calls.find((args) => args[0] === 'check-ref-format');
    expect(checkCall).toEqual(['check-ref-format', '--branch', 'feature/x']);
  });

  it('validateBranchName throws InvalidBranchNameError for a b', async () => {
    const adapter = createAdapter(() => createProcessRunResult());
    await adapter.detect(REPO_ROOT);
    const error = await adapter.validateBranchName('a b').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidBranchNameError);
    expect(String(error.message)).toContain('a b');
  });

  it('validateBranchName throws InvalidBranchNameError for a..b', async () => {
    const adapter = createAdapter(() => createProcessRunResult());
    await adapter.detect(REPO_ROOT);
    const error = await adapter.validateBranchName('a..b').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidBranchNameError);
    expect(String(error.message)).toContain('a..b');
  });

  it('validateBranchName throws InvalidBranchNameError for a@{b', async () => {
    const adapter = createAdapter(() => createProcessRunResult());
    await adapter.detect(REPO_ROOT);
    const error = await adapter.validateBranchName('a@{b').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidBranchNameError);
    expect(String(error.message)).toContain('a@{b');
  });

  it('validateBranchName throws InvalidBranchNameError for -a', async () => {
    const adapter = createAdapter(() => createProcessRunResult());
    await adapter.detect(REPO_ROOT);
    const error = await adapter.validateBranchName('-a').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidBranchNameError);
    expect(String(error.message)).toContain('-a');
  });

  it('validateBranchName throws InvalidBranchNameError for a.lock/b', async () => {
    const adapter = createAdapter(() => createProcessRunResult());
    await adapter.detect(REPO_ROOT);
    const error = await adapter.validateBranchName('a.lock/b').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidBranchNameError);
    expect(String(error.message)).toContain('a.lock/b');
  });

  it('validateBranchName throws RepositoryInspectionError when git cannot be executed', async () => {
    const adapter = createAdapter((args) => {
      if (args[0] === 'check-ref-format') {
        return createProcessRunResult({ exitCode: null, spawnFailed: true });
      }
      return createProcessRunResult();
    });
    await adapter.detect(REPO_ROOT);
    await expect(adapter.validateBranchName('feature/x')).rejects.toBeInstanceOf(
      RepositoryInspectionError,
    );
  });

  it('validateBranchName builds message from git stderr', async () => {
    const adapter = createAdapter((args) => {
      if (args[0] === 'check-ref-format') {
        return createProcessRunResult({
          exitCode: 128,
          stderr: "fatal: 'a b' is not a valid branch name",
        });
      }
      return createProcessRunResult();
    });
    await adapter.detect(REPO_ROOT);
    const error = await adapter.validateBranchName('a b').catch((e) => e);
    expect(error).toBeInstanceOf(InvalidBranchNameError);
    expect(String(error.message)).toContain('Invalid branch name "a b"');
  });

  it('createBranch throws OperationFailedError when the branch already exists and runs no checkout', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === 'check-ref-format') {
        return createProcessRunResult({ exitCode: 0 });
      }
      if (args[0] === 'show-ref') {
        return createProcessRunResult({ exitCode: 0 });
      }
      if (args[0] === 'checkout') {
        throw new Error('should not be called');
      }
      return createProcessRunResult();
    });
    await adapter.detect(REPO_ROOT);
    await expect(adapter.createBranch('feature/x')).rejects.toBeInstanceOf(OperationFailedError);
    expect(calls.some((args) => args[0] === 'checkout')).toBe(false);
  });

  it('createBranch throws InvalidBranchNameError for an invalid name and runs no checkout', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === 'checkout') {
        throw new Error('should not be called');
      }
      return createProcessRunResult();
    });
    await adapter.detect(REPO_ROOT);
    await expect(adapter.createBranch('a b')).rejects.toBeInstanceOf(InvalidBranchNameError);
    expect(calls.some((args) => args[0] === 'checkout')).toBe(false);
  });

  it('createBranch succeeds for a new valid name', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === 'check-ref-format') {
        return createProcessRunResult({ exitCode: 0 });
      }
      if (args[0] === 'show-ref') {
        return createProcessRunResult({ exitCode: 1 });
      }
      if (args[0] === 'checkout' && args.includes('-b')) {
        return createProcessRunResult({ exitCode: 0 });
      }
      return createProcessRunResult();
    });
    await adapter.detect(REPO_ROOT);
    await expect(adapter.createBranch('feature/x')).resolves.toBeUndefined();
    expect(calls.some((args) => args[0] === 'checkout' && args.includes('-b'))).toBe(true);
  });

  it('branchExists returns true for an existing branch and false for a missing one', async () => {
    const adapter = createAdapter((args) => {
      if (args[0] === 'show-ref') {
        if (args.includes('refs/heads/exist')) {
          return createProcessRunResult({ exitCode: 0 });
        }
        return createProcessRunResult({ exitCode: 1 });
      }
      return createProcessRunResult();
    });
    await adapter.detect(REPO_ROOT);
    await expect(adapter.branchExists('exist')).resolves.toBe(true);
    await expect(adapter.branchExists('missing')).resolves.toBe(false);
  });
});

describe('GitRepositoryAdapter.staging with StagedPath', () => {
  it('stagePaths stages only the new path for a renamed file (git handles old path)', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === '--literal-pathspecs' && args[1] === 'add') {
        return createProcessRunResult({ exitCode: 0 });
      }
      if (args[0] === '--literal-pathspecs' && args[1] === 'diff' && args.includes('--cached')) {
        return createProcessRunResult({ stdout: 'src/renamed.ts\0' });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    await adapter.stagePaths([{ path: 'src/renamed.ts', oldPath: 'src/old-name.ts' }]);

    const addCall = calls.find((args) => args[0] === '--literal-pathspecs' && args[1] === 'add');
    expect(addCall).toEqual(['--literal-pathspecs', 'add', '--', 'src/renamed.ts']);
  });

  it('stagePaths throws when an extra staged file appears', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === '--literal-pathspecs' && args[1] === 'add') {
        return createProcessRunResult({ exitCode: 0 });
      }
      if (args[0] === '--literal-pathspecs' && args[1] === 'diff' && args.includes('--cached')) {
        // Return an extra unexpected staged file
        return createProcessRunResult({ stdout: 'a.ts\0unexpected.ts\0' });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    const addCall = await adapter.stagePaths([{ path: 'a.ts' }]).catch(() => {});
    const callsWithAdd = calls.filter(
      (args) => args[0] === '--literal-pathspecs' && args[1] === 'add',
    );
    expect(callsWithAdd[0]).toEqual(['--literal-pathspecs', 'add', '--', 'a.ts']);
    await expect(adapter.stagePaths([{ path: 'a.ts' }])).rejects.toBeInstanceOf(
      OperationFailedError,
    );
    await expect(adapter.stagePaths([{ path: 'a.ts' }])).rejects.toThrow(
      'Unexpected staged paths: unexpected.ts',
    );
  });

  it('stagePaths throws when an expected path is missing', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === '--literal-pathspecs' && args[1] === 'add') {
        return createProcessRunResult({ exitCode: 0 });
      }
      if (args[0] === '--literal-pathspecs' && args[1] === 'diff' && args.includes('--cached')) {
        // Return only one of the expected paths
        return createProcessRunResult({ stdout: 'a.ts\0' });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    const addCall = await adapter.stagePaths([{ path: 'a.ts' }, { path: 'b.ts' }]).catch(() => {});
    const callsWithAdd = calls.filter(
      (args) => args[0] === '--literal-pathspecs' && args[1] === 'add',
    );
    expect(callsWithAdd[0]).toEqual(['--literal-pathspecs', 'add', '--', 'a.ts', 'b.ts']);
    await expect(adapter.stagePaths([{ path: 'a.ts' }, { path: 'b.ts' }])).rejects.toBeInstanceOf(
      OperationFailedError,
    );
    await expect(adapter.stagePaths([{ path: 'a.ts' }, { path: 'b.ts' }])).rejects.toThrow(
      'Missing expected staged paths: b.ts',
    );
  });

  it('getStagedPaths returns the new path for a renamed file', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === '--literal-pathspecs' && args[1] === 'diff' && args.includes('--cached')) {
        return createProcessRunResult({ stdout: 'src/renamed.ts\0' });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    const paths = await adapter.getStagedPaths();

    expect(paths).toEqual(['src/renamed.ts']);
  });

  it('getStagedPaths calls diff with correct args', async () => {
    const calls: string[][] = [];
    const adapter = createAdapter((args) => {
      calls.push(args);
      if (args[0] === '--literal-pathspecs' && args[1] === 'diff' && args.includes('--cached')) {
        return createProcessRunResult({ stdout: 'a.ts\0b.ts\0' });
      }
      return createProcessRunResult();
    });

    await adapter.detect(REPO_ROOT);
    const paths = await adapter.getStagedPaths();

    const diffCall = calls.find(
      (args) =>
        args[0] === '--literal-pathspecs' && args[1] === 'diff' && args.includes('--cached'),
    );
    expect(diffCall).toEqual(['--literal-pathspecs', 'diff', '--cached', '--name-only', '-z']);
    expect(paths).toEqual(['a.ts', 'b.ts']);
  });
});
