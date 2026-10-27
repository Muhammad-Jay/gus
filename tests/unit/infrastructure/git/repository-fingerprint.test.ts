import { describe, expect, it } from 'vitest';
import { OperationFailedError } from '../../../../src/domain/errors/domain-errors';
import type { ProcessRunResult } from '../../../../src/infrastructure/process/process-runner';
import { RepositoryFingerprintCalculator } from '../../../../src/infrastructure/repository/providers/git-cli/repository-fingerprint';
import { createProcessRunResult } from '../../../helpers/process-runner-fake';

const REPO_ROOT = '/tmp/gus-fingerprint';

class FakeGitCommandExecutor {
  readonly calls: string[][] = [];

  constructor(private readonly handler: (args: string[]) => ProcessRunResult) {}

  async run(args: string[]): Promise<ProcessRunResult> {
    this.calls.push(args);
    return this.handler(args);
  }
}

function createCalculator(headResult: Partial<ProcessRunResult>): RepositoryFingerprintCalculator {
  const runner = new FakeGitCommandExecutor((args) => {
    if (args[0] === 'rev-parse') {
      return createProcessRunResult(headResult);
    }
    return createProcessRunResult();
  });
  return new RepositoryFingerprintCalculator(runner);
}

describe('RepositoryFingerprintCalculator HEAD handling', () => {
  it('reads HEAD with rev-parse --verify --quiet', async () => {
    const runner = new FakeGitCommandExecutor((args) => {
      if (args[0] === 'rev-parse') {
        return createProcessRunResult({ stdout: 'abc123\n' });
      }
      return createProcessRunResult();
    });

    const result = await new RepositoryFingerprintCalculator(runner).compute(REPO_ROOT);

    expect(result.headSha).toBe('abc123');
    expect(runner.calls[0]).toEqual(['rev-parse', '--verify', '--quiet', 'HEAD']);
  });

  it('returns null when the repository has no HEAD yet', async () => {
    const result = await createCalculator({ exitCode: 1 }).compute(REPO_ROOT);
    expect(result.headSha).toBeNull();
  });

  it('throws when HEAD succeeds without a SHA', async () => {
    await expect(createCalculator({ stdout: '  \n' }).compute(REPO_ROOT)).rejects.toThrow(
      OperationFailedError,
    );
  });

  it('throws when HEAD cannot be executed', async () => {
    await expect(
      createCalculator({ exitCode: null, spawnFailed: true }).compute(REPO_ROOT),
    ).rejects.toThrow(OperationFailedError);
    await expect(createCalculator({ timedOut: true }).compute(REPO_ROOT)).rejects.toThrow(
      OperationFailedError,
    );
    await expect(
      createCalculator({ exitCode: 0, isTerminated: true }).compute(REPO_ROOT),
    ).rejects.toThrow(OperationFailedError);
  });

  it('throws for unexpected non-zero HEAD exits', async () => {
    await expect(createCalculator({ exitCode: 128 }).compute(REPO_ROOT)).rejects.toThrow(
      OperationFailedError,
    );
  });
});
