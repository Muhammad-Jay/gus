export type ChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged'
  | 'unknown';

export type StagingState = 'staged' | 'unstaged' | 'untracked';

export interface RepositoryChange {
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  stagingState: StagingState;
  hasStagedChanges?: boolean;
  hasUnstagedChanges?: boolean;
}
