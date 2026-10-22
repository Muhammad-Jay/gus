import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { OperationFailedError } from '../../../../domain/errors/domain-errors.js';
import { describeProcessFailure } from '../../../process/process-runner.js';
import type { GitCommandExecutor } from './git-metadata.js';

export interface RepositoryFingerprints {
  headSha: string | null;
  indexFingerprint: string;
  worktreeFingerprint: string;
}

export class RepositoryFingerprintCalculator {
  constructor(private readonly git: GitCommandExecutor) {}

  async compute(repoRoot: string): Promise<RepositoryFingerprints> {
    const headSha = await this.computeHeadSha(repoRoot);
    const indexFingerprint = await this.computeIndexFingerprint(repoRoot);
    const worktreeFingerprint = await this.computeWorktreeFingerprint(repoRoot);

    return {
      headSha,
      indexFingerprint,
      worktreeFingerprint,
    };
  }

  private async computeHeadSha(repoRoot: string): Promise<string | null> {
    const result = await this.git.run(['rev-parse', 'HEAD'], repoRoot);
    if (result.exitCode !== 0) {
      return null;
    }
    const sha = result.stdout.trim();
    if (sha.length === 0) {
      return null;
    }
    return sha;
  }

  private async computeIndexFingerprint(repoRoot: string): Promise<string> {
    const result = await this.git.run(['ls-files', '--stage', '-z'], repoRoot);
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to hash repository index: ${describeProcessFailure(result)}`,
      );
    }
    return this.hashString(result.stdout);
  }

  private async computeWorktreeFingerprint(repoRoot: string): Promise<string> {
    const diffResult = await this.git.run(['diff', '--no-color', '-z'], repoRoot);
    if (diffResult.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to hash worktree diff: ${describeProcessFailure(diffResult)}`,
      );
    }

    const statusResult = await this.git.run(
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      repoRoot,
    );
    if (statusResult.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to inspect worktree status for fingerprinting: ${describeProcessFailure(statusResult)}`,
      );
    }

    const hash = createHash('sha256');
    hash.update(this.lengthPrefixed('diff'));
    hash.update(this.lengthPrefixed(diffResult.stdout));

    hash.update(this.lengthPrefixed('status'));
    hash.update(this.lengthPrefixed(statusResult.stdout));

    const untrackedPaths = this.extractUntrackedPaths(statusResult.stdout);
    hash.update(this.lengthPrefixed('untracked-count'));
    hash.update(this.lengthPrefixed(String(untrackedPaths.length)));

    for (const relativePath of untrackedPaths) {
      hash.update(this.lengthPrefixed('untracked'));
      hash.update(this.lengthPrefixed(relativePath));
      const contentHash = this.hashUntrackedContent(repoRoot, relativePath);
      hash.update(this.lengthPrefixed(contentHash));
    }

    return hash.digest('hex');
  }

  private extractUntrackedPaths(porcelainOutput: string): string[] {
    const paths: string[] = [];
    const records = porcelainOutput.split('\0');
    for (let index = 0; index < records.length; index += 1) {
      const record = records.at(index);
      if (record === undefined || record.length < 4) {
        continue;
      }
      if (record.charAt(0) === '?' && record.charAt(1) === '?') {
        const path = record.slice(3);
        if (path.length > 0) {
          paths.push(path);
        }
      }
    }
    return paths;
  }

  private hashUntrackedContent(repoRoot: string, relativePath: string): string {
    const absolutePath = join(repoRoot, relativePath);
    try {
      const stats = lstatSync(absolutePath);
      if (stats.isSymbolicLink()) {
        return this.hashString(`symlink:${this.readLinkTarget(absolutePath, relativePath)}`);
      }
      if (!stats.isFile()) {
        return this.hashString(`nonfile:${relativePath}`);
      }
      const content = readFileSync(absolutePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return this.hashString(`unreadable:${relativePath}`);
    }
  }

  private readLinkTarget(absolutePath: string, relativePath: string): string {
    try {
      return readlinkSync(absolutePath);
    } catch {
      return relativePath;
    }
  }

  private hashString(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private lengthPrefixed(value: string): string {
    return `${value.length}:${value}\0`;
  }
}
