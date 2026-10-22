import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperationFailedError } from '../../../../src/domain/errors/domain-errors';
import type { RepositoryChange } from '../../../../src/domain/repository/repository-change';
import {
  ChangeContentCollector,
  MAX_BYTES_PER_FILE,
  MAX_CHANGED_FILES,
  MAX_TOTAL_BYTES,
} from '../../../../src/infrastructure/repository/providers/git-cli/change-content';
import type { GitCommandExecutor } from '../../../../src/infrastructure/repository/providers/git-cli/git-metadata';

interface FakeResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface ResponderOptions {
  tracked?: string[];
  staged?: (path: string) => string;
  unstaged?: (path: string) => string;
  stagedFailure?: { stderr: string };
}

class FakeGit implements GitCommandExecutor {
  readonly calls: string[][] = [];

  constructor(private readonly responder: (args: string[]) => FakeResponse) {}

  async run(args: string[], _cwd: string): Promise<FakeResponse> {
    this.calls.push(args);
    return this.responder(args);
  }
}

function isStagedDiff(args: string[]): boolean {
  return args.includes('diff') && args.includes('--cached');
}

function isUnstagedDiff(args: string[]): boolean {
  return args.includes('diff') && !args.includes('--cached');
}

function pathOf(args: string[]): string {
  const separator = args.indexOf('--');
  return separator === -1 ? '' : (args[separator + 1] ?? '');
}

function createResponder(options: ResponderOptions = {}): (args: string[]) => FakeResponse {
  return (args) => {
    if (args.includes('ls-files')) {
      const requested = args.slice(args.indexOf('--') + 1);
      const tracked = options.tracked ?? requested;
      return {
        stdout: tracked.length > 0 ? `${tracked.join('\0')}\0` : '',
        stderr: '',
        exitCode: 0,
      };
    }

    const path = pathOf(args);
    if (isStagedDiff(args)) {
      if (options.stagedFailure !== undefined) {
        return { stdout: '', stderr: options.stagedFailure.stderr, exitCode: 1 };
      }
      return { stdout: options.staged?.(path) ?? '', stderr: '', exitCode: 0 };
    }

    if (isUnstagedDiff(args)) {
      return { stdout: options.unstaged?.(path) ?? '', stderr: '', exitCode: 0 };
    }

    return { stdout: '', stderr: '', exitCode: 0 };
  };
}

function change(overrides: Partial<RepositoryChange> = {}): RepositoryChange {
  return {
    path: 'a.ts',
    status: 'modified',
    stagingState: 'unstaged',
    ...overrides,
  };
}

describe('ChangeContentCollector', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'gus-change-content-'));
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('returns the unstaged diff of a modified tracked file', async () => {
    const git = new FakeGit(
      createResponder({ unstaged: () => 'diff --git a/a.ts b/a.ts\n+const value = 1;\n' }),
    );
    const collector = new ChangeContentCollector(git);

    const contents = await collector.collect(repoRoot, [change({ path: 'a.ts' })]);

    expect(contents).toHaveLength(1);
    expect(contents[0].unstagedDiff).toContain('+const value = 1;');
    expect(contents[0].stagedDiff).toBe('');
    expect(contents[0].contentOmitted).toBe(false);
  });

  it('returns the staged diff of a staged file', async () => {
    const git = new FakeGit(
      createResponder({ staged: () => 'diff --git a/a.ts b/a.ts\n+const value = 1;\n' }),
    );
    const collector = new ChangeContentCollector(git);

    const contents = await collector.collect(repoRoot, [
      change({ path: 'a.ts', status: 'added', stagingState: 'staged' }),
    ]);

    expect(contents[0].stagedDiff).toContain('+const value = 1;');
    expect(contents[0].unstagedDiff).toBe('');
  });

  it('includes the old path in the staged diff command of a rename', async () => {
    const git = new FakeGit(createResponder());
    const collector = new ChangeContentCollector(git);

    await collector.collect(repoRoot, [
      change({ path: 'new.ts', oldPath: 'old.ts', status: 'renamed', stagingState: 'staged' }),
    ]);

    const stagedCall = git.calls.find((args) => isStagedDiff(args));
    expect(stagedCall).toEqual([
      '--literal-pathspecs',
      'diff',
      '--cached',
      '--no-color',
      '--',
      'new.ts',
      'old.ts',
    ]);
  });

  it('passes paths literally instead of as pathspec globs', async () => {
    const git = new FakeGit(createResponder());
    const collector = new ChangeContentCollector(git);

    await collector.collect(repoRoot, [change({ path: 'a*.ts' })]);

    const stagedCall = git.calls.find((args) => isStagedDiff(args));
    const unstagedCall = git.calls.find((args) => isUnstagedDiff(args));

    expect(stagedCall?.[0]).toBe('--literal-pathspecs');
    expect(stagedCall).toContain('--');
    expect(stagedCall?.at(-1)).toBe('a*.ts');
    expect(unstagedCall?.[0]).toBe('--literal-pathspecs');
    expect(unstagedCall).toContain('--');
    expect(unstagedCall?.at(-1)).toBe('a*.ts');
  });

  it('returns the content of an untracked file', async () => {
    await writeFile(join(repoRoot, 'new.txt'), 'hello world\n');
    const git = new FakeGit(createResponder({ tracked: [] }));
    const collector = new ChangeContentCollector(git);

    const contents = await collector.collect(repoRoot, [
      change({ path: 'new.txt', status: 'added', stagingState: 'untracked' }),
    ]);

    expect(contents[0].addedContent).toBe('hello world\n');
    expect(contents[0].truncated).toBe(false);
    expect(contents[0].contentOmitted).toBe(false);
  });

  it('returns a marker for a symbolic link instead of the link target content', async () => {
    await writeFile(join(repoRoot, 'target.txt'), 'SECRET TARGET CONTENT');
    await symlink('target.txt', join(repoRoot, 'link.txt'));
    const git = new FakeGit(createResponder({ tracked: [] }));
    const collector = new ChangeContentCollector(git);

    const contents = await collector.collect(repoRoot, [
      change({ path: 'link.txt', status: 'added', stagingState: 'untracked' }),
    ]);

    expect(contents[0].addedContent).toBe('[symbolic link -> target.txt]');
    expect(contents[0].addedContent).not.toContain('SECRET TARGET CONTENT');
  });

  it('returns a marker instead of throwing when a file cannot be read', async () => {
    const git = new FakeGit(createResponder({ tracked: [] }));
    const collector = new ChangeContentCollector(git);

    const contents = await collector.collect(repoRoot, [
      change({ path: 'missing.txt', status: 'added', stagingState: 'untracked' }),
    ]);

    expect(contents[0].addedContent).toBe('[unreadable file: missing.txt]');
  });

  it('truncates a file that is larger than the per-file limit', async () => {
    await writeFile(join(repoRoot, 'big.txt'), 'x'.repeat(MAX_BYTES_PER_FILE + 500));
    const git = new FakeGit(createResponder({ tracked: [] }));
    const collector = new ChangeContentCollector(git);

    const contents = await collector.collect(repoRoot, [
      change({ path: 'big.txt', status: 'added', stagingState: 'untracked' }),
    ]);

    expect(contents[0].truncated).toBe(true);
    expect(contents[0].addedContent).toContain('[truncated: showing the first');
    expect(Buffer.byteLength(contents[0].addedContent, 'utf8')).toBeLessThanOrEqual(
      MAX_BYTES_PER_FILE,
    );
  });

  it('omits the remaining files when the total byte budget is exceeded', async () => {
    const git = new FakeGit(createResponder({ unstaged: () => 'x'.repeat(MAX_BYTES_PER_FILE) }));
    const collector = new ChangeContentCollector(git);
    const changes = Array.from({ length: 20 }, (_, index) => change({ path: `file-${index}.ts` }));

    const contents = await collector.collect(repoRoot, changes);

    const included = contents.filter((content) => !content.contentOmitted);
    const omitted = contents.filter((content) => content.contentOmitted);
    expect(included).toHaveLength(MAX_TOTAL_BYTES / MAX_BYTES_PER_FILE);
    expect(omitted).toHaveLength(20 - MAX_TOTAL_BYTES / MAX_BYTES_PER_FILE);
    expect(omitted[0].stagedDiff).toBe('');
    expect(omitted[0].unstagedDiff).toBe('');
    expect(omitted[0].addedContent).toBe('');
  });

  it('omits the changes beyond the maximum number of changed files', async () => {
    const git = new FakeGit(createResponder());
    const collector = new ChangeContentCollector(git);
    const changes = Array.from({ length: MAX_CHANGED_FILES + 3 }, (_, index) =>
      change({ path: `file-${index}.ts` }),
    );

    const contents = await collector.collect(repoRoot, changes);

    expect(contents).toHaveLength(MAX_CHANGED_FILES + 3);
    expect(contents[MAX_CHANGED_FILES - 1].contentOmitted).toBe(false);
    expect(contents[MAX_CHANGED_FILES].contentOmitted).toBe(true);
    expect(contents[MAX_CHANGED_FILES + 2].contentOmitted).toBe(true);
  });

  it('returns exactly one entry per change in input order', async () => {
    const git = new FakeGit(createResponder());
    const collector = new ChangeContentCollector(git);
    const changes = [
      change({ path: 'first.ts' }),
      change({ path: 'second.ts' }),
      change({ path: 'third.ts' }),
    ];

    const contents = await collector.collect(repoRoot, changes);

    expect(contents).toHaveLength(changes.length);
    expect(contents.map((content) => content.path)).toEqual(['first.ts', 'second.ts', 'third.ts']);
  });

  it('fails when a diff command exits with a non-zero status', async () => {
    const git = new FakeGit(createResponder({ stagedFailure: { stderr: 'fatal: bad object' } }));
    const collector = new ChangeContentCollector(git);

    await expect(
      collector.collect(repoRoot, [
        change({ path: 'a.ts', status: 'added', stagingState: 'staged' }),
      ]),
    ).rejects.toBeInstanceOf(OperationFailedError);
  });

  it('reports the git error output when a diff command fails', async () => {
    const git = new FakeGit(createResponder({ stagedFailure: { stderr: 'fatal: bad object' } }));
    const collector = new ChangeContentCollector(git);

    await expect(
      collector.collect(repoRoot, [
        change({ path: 'a.ts', status: 'added', stagingState: 'staged' }),
      ]),
    ).rejects.toThrow('fatal: bad object');
  });
});
