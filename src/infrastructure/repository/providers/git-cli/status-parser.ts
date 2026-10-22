import type {
  ChangeStatus,
  RepositoryChange,
  StagingState,
} from '../../../../domain/repository/repository-change.js';

const STATUS_CODES = new Set([' ', 'M', 'A', 'D', 'R', 'C', 'U', 'T', '?', '!']);

function isStatusCode(value: string): boolean {
  return STATUS_CODES.has(value);
}

function isUnmerged(x: string, y: string): boolean {
  return x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
}

function resolveStatus(code: string): ChangeStatus {
  switch (code) {
    case 'A':
    case '?':
      return 'added';
    case 'D':
      return 'deleted';
    case 'M':
    case 'T':
      return 'modified';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'U':
      return 'unmerged';
    default:
      return 'unknown';
  }
}

/**
 * Parses NUL-delimited `git status --porcelain=v1 -z` output into repository changes.
 *
 * The input must be the raw `-z` output: every record is terminated by a single NUL byte, paths
 * are literal and never quoted or escaped, and a rename or copy record is followed by an extra
 * NUL-terminated record that holds the original path. The line-based porcelain format is not
 * supported.
 */
export function parseGitStatus(porcelainOutput: string): RepositoryChange[] {
  const changes: RepositoryChange[] = [];
  const records = porcelainOutput.split('\0');

  for (let index = 0; index < records.length; index += 1) {
    const record = records.at(index);
    if (record === undefined || record.length < 4) {
      continue;
    }

    const x = record.charAt(0);
    const y = record.charAt(1);
    if (record.charAt(2) !== ' ' || !isStatusCode(x) || !isStatusCode(y)) {
      continue;
    }

    const path = record.slice(3);
    const hasStaged = x !== ' ' && x !== '?' && x !== '!';
    const hasUnstaged = y !== ' ' && y !== '?' && y !== '!';

    let oldPath: string | undefined;
    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      const original = records.at(index + 1);
      if (original !== undefined) {
        index += 1;
        if (original.length > 0) {
          oldPath = original;
        }
      }
    }

    const status: ChangeStatus = isUnmerged(x, y) ? 'unmerged' : resolveStatus(x !== ' ' ? x : y);

    let stagingState: StagingState;
    if (x === '?' && y === '?') {
      stagingState = 'untracked';
    } else if (hasStaged && hasUnstaged) {
      stagingState = 'mixed';
    } else if (hasStaged) {
      stagingState = 'staged';
    } else {
      stagingState = 'unstaged';
    }

    changes.push({
      path,
      ...(oldPath !== undefined ? { oldPath } : {}),
      status,
      stagingState,
      hasStagedChanges: hasStaged,
      hasUnstagedChanges: hasUnstaged,
    });
  }

  return changes;
}
