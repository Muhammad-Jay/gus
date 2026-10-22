import { describe, expect, it } from 'vitest';
import { RepositoryInspectionError } from '../../../../src/domain/errors/domain-errors';
import { GitMetadataResolver } from '../../../../src/infrastructure/repository/providers/git-cli/git-metadata';

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

class FakeGitCommandExecutor {
  readonly calls: Array<{ args: string[]; cwd: string }> = [];

  constructor(private handler: (args: string[]) => CommandResult) {}

  async run(args: string[], cwd: string): Promise<CommandResult> {
    this.calls.push({ args, cwd });
    return this.handler(args);
  }
}

const REPO_ROOT = '/tmp/gus-repo';

describe('GitMetadataResolver', () => {
  describe('resolveGitDir', () => {
    it('should return the absolute git directory reported by git', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '/tmp/gus-repo/.git\n',
        stderr: '',
        exitCode: 0,
      }));
      const resolver = new GitMetadataResolver(git);

      const gitDir = await resolver.resolveGitDir(REPO_ROOT);

      expect(gitDir).toBe('/tmp/gus-repo/.git');
      expect(git.calls).toHaveLength(1);
      expect(git.calls[0].args).toEqual(['rev-parse', '--absolute-git-dir']);
      expect(git.calls[0].cwd).toBe(REPO_ROOT);
    });

    it('should throw a RepositoryInspectionError including stderr on failure', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '',
        stderr: 'fatal: not a git repository\n',
        exitCode: 128,
      }));
      const resolver = new GitMetadataResolver(git);

      await expect(resolver.resolveGitDir(REPO_ROOT)).rejects.toBeInstanceOf(
        RepositoryInspectionError,
      );
      await expect(resolver.resolveGitDir(REPO_ROOT)).rejects.toThrow(
        'fatal: not a git repository',
      );
    });

    it('should throw a RepositoryInspectionError when git returns an empty path', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '   \n',
        stderr: '',
        exitCode: 0,
      }));
      const resolver = new GitMetadataResolver(git);

      await expect(resolver.resolveGitDir(REPO_ROOT)).rejects.toBeInstanceOf(
        RepositoryInspectionError,
      );
    });
  });

  describe('resolveGitPath', () => {
    it('should resolve a git path to an absolute location', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '/tmp/gus-repo/.git/MERGE_HEAD\n',
        stderr: '',
        exitCode: 0,
      }));
      const resolver = new GitMetadataResolver(git);

      const path = await resolver.resolveGitPath(REPO_ROOT, 'MERGE_HEAD');

      expect(path).toBe('/tmp/gus-repo/.git/MERGE_HEAD');
      expect(git.calls[0].args).toEqual([
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'MERGE_HEAD',
      ]);
    });

    it('should fall back to the resolved git directory when the path command fails', async () => {
      const git = new FakeGitCommandExecutor((args) => {
        if (args.includes('--git-path')) {
          return { stdout: '', stderr: 'error: unknown option', exitCode: 129 };
        }
        return { stdout: '/tmp/gus-repo/.git\n', stderr: '', exitCode: 0 };
      });
      const resolver = new GitMetadataResolver(git);

      const path = await resolver.resolveGitPath(REPO_ROOT, 'rebase-merge');

      expect(path).toBe('/tmp/gus-repo/.git/rebase-merge');
    });

    it('should fall back to the resolved git directory when the path command returns nothing', async () => {
      const git = new FakeGitCommandExecutor((args) => {
        if (args.includes('--git-path')) {
          return { stdout: '', stderr: '', exitCode: 0 };
        }
        return { stdout: '/tmp/gus-repo/.git\n', stderr: '', exitCode: 0 };
      });
      const resolver = new GitMetadataResolver(git);

      const path = await resolver.resolveGitPath(REPO_ROOT, 'sequencer');

      expect(path).toBe('/tmp/gus-repo/.git/sequencer');
    });
  });

  describe('branchExists', () => {
    it('should return true when the branch reference exists', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '',
        stderr: '',
        exitCode: 0,
      }));
      const resolver = new GitMetadataResolver(git);

      await expect(resolver.branchExists(REPO_ROOT, 'feature/x')).resolves.toBe(true);
      expect(git.calls[0].args).toEqual([
        'show-ref',
        '--verify',
        '--quiet',
        'refs/heads/feature/x',
      ]);
    });

    it('should return false when the branch reference is missing', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '',
        stderr: 'fatal: ref not found',
        exitCode: 1,
      }));
      const resolver = new GitMetadataResolver(git);

      await expect(resolver.branchExists(REPO_ROOT, 'feature/x')).resolves.toBe(false);
    });

    it('should return false instead of throwing for unexpected failures', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '',
        stderr: 'fatal: not a git repository',
        exitCode: 128,
      }));
      const resolver = new GitMetadataResolver(git);

      await expect(resolver.branchExists(REPO_ROOT, 'feature/x')).resolves.toBe(false);
    });

    it('should throw when the branch check could not be executed', async () => {
      const git = new FakeGitCommandExecutor(() => ({
        stdout: '',
        stderr: '',
        exitCode: null,
      }));
      const resolver = new GitMetadataResolver(git);

      await expect(resolver.branchExists(REPO_ROOT, 'feature/x')).rejects.toBeInstanceOf(
        RepositoryInspectionError,
      );
    });
  });
});
