import { describe, expect, it } from 'vitest';
import { RepositoryInspectionError } from '../../../../src/domain/errors/domain-errors';
import type { ProcessRunResult } from '../../../../src/infrastructure/process/process-runner';
import { GitCapabilityDetector } from '../../../../src/infrastructure/repository/providers/git-cli/git-capabilities';
import { createProcessRunResult } from '../../../helpers/process-runner-fake';

const REPO_ROOT = '/tmp/gus-capabilities';

class FakeGitCommandExecutor {
  readonly calls: string[][] = [];

  constructor(private readonly handler: (args: string[]) => ProcessRunResult) {}

  async run(args: string[]): Promise<ProcessRunResult> {
    this.calls.push(args);
    return this.handler(args);
  }
}

function createDetector(overrides: {
  version?: Partial<ProcessRunResult>;
  bare?: Partial<ProcessRunResult>;
  author?: Partial<ProcessRunResult>;
  committer?: Partial<ProcessRunResult>;
}): GitCapabilityDetector {
  const git = new FakeGitCommandExecutor((args) => {
    if (args[0] === '--version') {
      return createProcessRunResult({ stdout: 'git version 2.43.0\n', ...overrides.version });
    }
    if (args[1] === '--is-bare-repository') {
      return createProcessRunResult({ stdout: 'false\n', ...overrides.bare });
    }
    if (args[1] === 'GIT_AUTHOR_IDENT') {
      return createProcessRunResult({
        stdout: 'Test User <test@example.com> 1700000000 +0000\n',
        ...overrides.author,
      });
    }
    if (args[1] === 'GIT_COMMITTER_IDENT') {
      return createProcessRunResult({
        stdout: 'Test User <test@example.com> 1700000000 +0000\n',
        ...overrides.committer,
      });
    }
    return createProcessRunResult();
  });
  return new GitCapabilityDetector(git);
}

describe('GitCapabilityDetector', () => {
  it('reports supported operations for a normal repository', async () => {
    const capabilities = await createDetector({}).detect(REPO_ROOT);

    expect(capabilities).toEqual({
      canCreateBranch: true,
      canCheckoutBranch: true,
      canStagePaths: true,
      canCommit: true,
      supportsRenameDetection: true,
    });
  });

  it('disables rename detection for old Git versions', async () => {
    const capabilities = await createDetector({
      version: { stdout: 'git version 2.8.6\n' },
    }).detect(REPO_ROOT);

    expect(capabilities.supportsRenameDetection).toBe(false);
  });

  it('disables all mutations for a bare repository', async () => {
    const capabilities = await createDetector({
      bare: { stdout: 'true\n' },
    }).detect(REPO_ROOT);

    expect(capabilities).toEqual({
      canCreateBranch: false,
      canCheckoutBranch: false,
      canStagePaths: false,
      canCommit: false,
      supportsRenameDetection: false,
    });
  });

  it('reports committing as unsupported when identity is missing', async () => {
    const capabilities = await createDetector({
      author: { exitCode: 128, stderr: 'fatal: unable to auto-detect email address' },
    }).detect(REPO_ROOT);

    expect(capabilities.canCommit).toBe(false);
    expect(capabilities.canStagePaths).toBe(true);
  });

  it('reports committing as unsupported when the committer identity is missing', async () => {
    const capabilities = await createDetector({
      committer: { exitCode: 128, stderr: 'fatal: unable to auto-detect email address' },
    }).detect(REPO_ROOT);

    expect(capabilities.canCommit).toBe(false);
  });

  it('throws when Git cannot be executed', async () => {
    await expect(
      createDetector({
        version: { exitCode: null, spawnFailed: true },
      }).detect(REPO_ROOT),
    ).rejects.toBeInstanceOf(RepositoryInspectionError);
  });

  it('throws when the version cannot be parsed', async () => {
    await expect(
      createDetector({ version: { stdout: 'unknown\n' } }).detect(REPO_ROOT),
    ).rejects.toBeInstanceOf(RepositoryInspectionError);
  });

  it('throws when the repository layout cannot be inspected', async () => {
    await expect(
      createDetector({ bare: { exitCode: 1, stderr: 'fatal: bad repository' } }).detect(REPO_ROOT),
    ).rejects.toBeInstanceOf(RepositoryInspectionError);
  });

  it('throws when identity inspection cannot be executed', async () => {
    await expect(
      createDetector({ author: { exitCode: null, timedOut: true } }).detect(REPO_ROOT),
    ).rejects.toBeInstanceOf(RepositoryInspectionError);
  });
});
