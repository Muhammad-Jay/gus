import type { ChangeStatus, StagingState } from './repository-change.js';

export interface ChangeContent {
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  stagingState: StagingState;
  stagedDiff: string;
  unstagedDiff: string;
  addedContent: string;
  truncated: boolean;
  contentOmitted: boolean;
}
