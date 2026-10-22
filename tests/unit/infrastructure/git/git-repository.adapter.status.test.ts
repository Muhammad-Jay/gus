import { describe, expect, it } from 'vitest';
import { RepositoryInspectionError } from '../../../../src/domain/errors/domain-errors';
import type {
  ProcessRunOptions,
  ProcessRunResult,
} from '../../../../src/infrastructure/process/process-runner';
import { GitRepositoryAdapter } from '../../../../src/infrastructure/repository/providers/git-cli/git-repository.adapter';

class FakeProcessRunner {
  constructor(private readonly handler: (args: string[]) => ProcessRunResult) {}

  async run(
    _executable: string,
    args: string[] = [],
    _options?: ProcessRunOptions,
  ): Promise<ProcessRunResult> {
    return this.handler(args);
  }
}

const REPO_ROOT = '/tmp/gus-fake-repository';
const GIT_DIR = `${REPO_ROOT}/.git`;

function createAdapter(handler: (args: string[]) => ProcessRunResult): GitRepositoryAdapter {
  const runner = new FakeProcessRunner((args) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') {
      return { stdout: REPO_ROOT, stderr: '', exitCode: 0 };
    }
    if (args[0] === 'rev-parse' && args[1] === '--absolute-git-dir') {
      return { stdout: GIT_DIR, stderr: '', exitCode: 0 };
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
        return { stdout: '?? untracked.ts\0', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
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
        return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    await adapter.detect(REPO_ROOT);

    await expect(adapter.inspect()).rejects.toThrow(RepositoryInspectionError);
    await expect(adapter.inspect()).rejects.toThrow('fatal: not a git repository');
  });
});
