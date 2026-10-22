import {
  type Stats,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { OperationFailedError } from '../../../../domain/errors/domain-errors.js';
import type { ChangeContent } from '../../../../domain/repository/change-content.js';
import type { RepositoryChange } from '../../../../domain/repository/repository-change.js';
import type { GitCommandExecutor } from './git-metadata.js';

export const MAX_CHANGED_FILES = 500;
export const MAX_BYTES_PER_FILE = 16 * 1024;
export const MAX_TOTAL_BYTES = 256 * 1024;

const MARKER_RESERVE_BYTES = 128;

interface FileContent {
  text: string;
  totalBytes: number;
  readTruncated: boolean;
}

interface BudgetedContent {
  stagedDiff: string;
  unstagedDiff: string;
  addedContent: string;
  truncated: boolean;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function takeBytes(
  value: string,
  budget: number,
): { text: string; bytes: number; truncated: boolean } {
  if (value.length === 0) {
    return { text: '', bytes: 0, truncated: false };
  }
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= budget) {
    return { text: value, bytes: buffer.length, truncated: false };
  }
  if (budget <= 0) {
    return { text: '', bytes: 0, truncated: true };
  }
  let end = budget;
  while (end > 0 && end < buffer.length && (buffer[end] & 0xc0) === 0x80) {
    end -= 1;
  }
  return { text: buffer.subarray(0, end).toString('utf8'), bytes: end, truncated: true };
}

function markerText(shownBytes: number, totalBytes: number): string {
  return `[truncated: showing the first ${shownBytes} bytes of ${totalBytes}]`;
}

function withMarker(text: string, marker: string): string {
  if (text.length === 0) {
    return marker;
  }
  return text.endsWith('\n') ? `${text}${marker}` : `${text}\n${marker}`;
}

/**
 * Collects the actual content of repository changes so a planner can reason about them.
 *
 * The collector never executes commands from repository content, and it only ever reads the
 * files it was asked about. Every content amount is bounded, and files that cannot be collected
 * completely are reported as omitted instead of being silently dropped.
 */
export class ChangeContentCollector {
  constructor(private readonly git: GitCommandExecutor) {}

  async collect(repoRoot: string, changes: RepositoryChange[]): Promise<ChangeContent[]> {
    const included = changes.slice(0, MAX_CHANGED_FILES);
    const trackedPaths = await this.collectTrackedPaths(
      repoRoot,
      included.map((change) => change.path),
    );

    const contents: ChangeContent[] = [];
    let totalBytes = 0;

    for (const [index, change] of changes.entries()) {
      if (index >= MAX_CHANGED_FILES) {
        contents.push(this.omittedContent(change));
        continue;
      }

      const collected = await this.collectChange(repoRoot, change, trackedPaths);
      const collectedBytes =
        byteLength(collected.stagedDiff) +
        byteLength(collected.unstagedDiff) +
        byteLength(collected.addedContent);

      if (totalBytes + collectedBytes > MAX_TOTAL_BYTES) {
        contents.push(this.omittedContent(change));
        continue;
      }

      totalBytes += collectedBytes;
      contents.push(collected);
    }

    return contents;
  }

  private async collectChange(
    repoRoot: string,
    change: RepositoryChange,
    trackedPaths: Set<string>,
  ): Promise<ChangeContent> {
    const stagedDiff = await this.readStagedDiff(repoRoot, change);
    const unstagedDiff = await this.readUnstagedDiff(repoRoot, change);
    const addedContent = this.readAddedContent(
      repoRoot,
      change,
      stagedDiff,
      unstagedDiff,
      trackedPaths,
    );
    const budgeted = applyFileBudget(stagedDiff, unstagedDiff, addedContent);

    return {
      path: change.path,
      ...(change.oldPath !== undefined ? { oldPath: change.oldPath } : {}),
      status: change.status,
      stagingState: change.stagingState,
      stagedDiff: budgeted.stagedDiff,
      unstagedDiff: budgeted.unstagedDiff,
      addedContent: budgeted.addedContent,
      truncated: budgeted.truncated,
      contentOmitted: false,
    };
  }

  private omittedContent(change: RepositoryChange): ChangeContent {
    return {
      path: change.path,
      ...(change.oldPath !== undefined ? { oldPath: change.oldPath } : {}),
      status: change.status,
      stagingState: change.stagingState,
      stagedDiff: '',
      unstagedDiff: '',
      addedContent: '',
      truncated: false,
      contentOmitted: true,
    };
  }

  private async readStagedDiff(repoRoot: string, change: RepositoryChange): Promise<string> {
    const pathspecs = [change.path];
    if (change.oldPath !== undefined) {
      pathspecs.push(change.oldPath);
    }

    const result = await this.git.run(
      ['--literal-pathspecs', 'diff', '--cached', '--no-color', '--', ...pathspecs],
      repoRoot,
    );
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to read the staged diff for "${change.path}": ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
      );
    }
    return result.stdout;
  }

  private async readUnstagedDiff(repoRoot: string, change: RepositoryChange): Promise<string> {
    const result = await this.git.run(
      ['--literal-pathspecs', 'diff', '--no-color', '--', change.path],
      repoRoot,
    );
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to read the unstaged diff for "${change.path}": ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
      );
    }
    return result.stdout;
  }

  private async collectTrackedPaths(repoRoot: string, paths: string[]): Promise<Set<string>> {
    if (paths.length === 0) {
      return new Set<string>();
    }

    const result = await this.git.run(
      ['--literal-pathspecs', 'ls-files', '-z', '--', ...paths],
      repoRoot,
    );
    if (result.exitCode !== 0) {
      throw new OperationFailedError(
        `Failed to list tracked files: ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
      );
    }

    return new Set(result.stdout.split('\0').filter((path) => path.length > 0));
  }

  private readAddedContent(
    repoRoot: string,
    change: RepositoryChange,
    stagedDiff: string,
    unstagedDiff: string,
    trackedPaths: Set<string>,
  ): FileContent {
    const wantsContent =
      change.stagingState === 'untracked' ||
      (stagedDiff.length === 0 && unstagedDiff.length === 0 && !trackedPaths.has(change.path));

    if (!wantsContent) {
      return { text: '', totalBytes: 0, readTruncated: false };
    }

    return this.readFileFromDisk(repoRoot, change.path);
  }

  private readFileFromDisk(repoRoot: string, relativePath: string): FileContent {
    const absolutePath = join(repoRoot, relativePath);
    let stats: Stats;
    try {
      stats = lstatSync(absolutePath);
    } catch {
      return unreadableContent(relativePath);
    }

    if (stats.isSymbolicLink()) {
      let target = relativePath;
      try {
        target = readlinkSync(absolutePath);
      } catch {
        target = relativePath;
      }
      const text = `[symbolic link -> ${target}]`;
      return { text, totalBytes: byteLength(text), readTruncated: false };
    }

    if (stats.isDirectory()) {
      const text = `[directory: ${relativePath}]`;
      return { text, totalBytes: byteLength(text), readTruncated: false };
    }

    if (!stats.isFile()) {
      const text = `[not a regular file: ${relativePath}]`;
      return { text, totalBytes: byteLength(text), readTruncated: false };
    }

    let descriptor: number | null = null;
    try {
      descriptor = openSync(absolutePath, 'r');
      const size = fstatSync(descriptor).size;
      const limit = Math.min(size, MAX_BYTES_PER_FILE + 1);
      const buffer = Buffer.alloc(limit);
      const bytesRead = readSync(descriptor, buffer, 0, limit, 0);
      return {
        text: buffer.subarray(0, bytesRead).toString('utf8'),
        totalBytes: size,
        readTruncated: size > bytesRead,
      };
    } catch {
      return unreadableContent(relativePath);
    } finally {
      if (descriptor !== null) {
        closeSync(descriptor);
      }
    }
  }
}

function unreadableContent(relativePath: string): FileContent {
  const text = `[unreadable file: ${relativePath}]`;
  return { text, totalBytes: byteLength(text), readTruncated: false };
}

function applyFileBudget(
  stagedDiff: string,
  unstagedDiff: string,
  addedContent: FileContent,
): BudgetedContent {
  const totalBytes = byteLength(stagedDiff) + byteLength(unstagedDiff) + addedContent.totalBytes;

  if (totalBytes <= MAX_BYTES_PER_FILE) {
    return {
      stagedDiff,
      unstagedDiff,
      addedContent: addedContent.text,
      truncated: addedContent.readTruncated,
    };
  }

  let remaining = MAX_BYTES_PER_FILE - MARKER_RESERVE_BYTES;
  const staged = takeBytes(stagedDiff, remaining);
  remaining -= staged.bytes;
  const unstaged = takeBytes(unstagedDiff, remaining);
  remaining -= unstaged.bytes;
  const added = takeBytes(addedContent.text, remaining);

  const shownBytes = staged.bytes + unstaged.bytes + added.bytes;
  const marker = markerText(shownBytes, totalBytes);

  const stagedTruncated = staged.truncated;
  const unstagedTruncated = unstaged.truncated;
  const addedTruncated = added.truncated || addedContent.readTruncated;
  const markerIndex = stagedTruncated ? 0 : unstagedTruncated ? 1 : 2;

  return {
    stagedDiff: markerIndex === 0 ? withMarker(staged.text, marker) : staged.text,
    unstagedDiff: markerIndex === 1 ? withMarker(unstaged.text, marker) : unstaged.text,
    addedContent: markerIndex === 2 ? withMarker(added.text, marker) : added.text,
    truncated: stagedTruncated || unstagedTruncated || addedTruncated,
  };
}
