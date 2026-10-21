import type {
  ChangeStatus,
  RepositoryChange,
  StagingState,
} from '../../../../domain/repository/repository-change.js';

export function parseGitStatus(porcelainOutput: string): RepositoryChange[] {
  const changes: RepositoryChange[] = [];
  if (!porcelainOutput.trim()) {
    return changes;
  }

  const lines = porcelainOutput.split('\n').filter((line) => line.length > 0);

  for (const line of lines) {
    if (line.length < 3) continue;

    const x = line[0];
    const y = line[1];
    const rest = line.substring(3);

    // Handle renames
    if (x === 'R' || y === 'R') {
      const parts = rest.split(' -> ');
      if (parts.length === 2) {
        const oldPath = parts[0];
        const newPath = parts[1];
        // Determine staging state
        let stagingState: StagingState = 'unstaged';
        if (x !== ' ' && x !== '?') {
          stagingState = 'staged';
        }
        changes.push({
          path: newPath,
          oldPath,
          status: 'renamed',
          stagingState,
          hasStagedChanges: x !== ' ' && x !== '?',
          hasUnstagedChanges: y !== ' ' && y !== '?',
        });
        continue;
      }
    }

    // Untracked files
    if (x === '?' && y === '?') {
      changes.push({
        path: rest,
        status: 'added',
        stagingState: 'untracked',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
      });
      continue;
    }

    // Conflicts
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      changes.push({
        path: rest,
        status: 'unmerged',
        stagingState: 'unstaged',
        hasStagedChanges: false,
        hasUnstagedChanges: true,
      });
      continue;
    }

    // Determine status
    let status: ChangeStatus = 'modified';
    const code = x !== ' ' ? x : y;
    if (code === 'A') status = 'added';
    else if (code === 'D') status = 'deleted';
    else if (code === 'M') status = 'modified';
    else if (code === 'R') status = 'renamed';
    else if (code === 'C') status = 'copied';

    // Determine staging state
    let stagingState: StagingState = 'unstaged';
    const hasStaged = x !== ' ' && x !== '?';
    const hasUnstaged = y !== ' ' && y !== '?';

    if (hasStaged && !hasUnstaged) {
      stagingState = 'staged';
    } else if (!hasStaged && hasUnstaged) {
      stagingState = 'unstaged';
    } else if (hasStaged && hasUnstaged) {
      // File has both staged and unstaged changes - treat as staged for now
      stagingState = 'staged';
    }

    changes.push({
      path: rest,
      status,
      stagingState,
      hasStagedChanges: hasStaged,
      hasUnstagedChanges: hasUnstaged,
    });
  }

  return changes;
}
