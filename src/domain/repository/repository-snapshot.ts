import type { RepositoryChange } from './repository-change.js';

export interface RepositorySnapshot {
  rootPath: string;
  displayName: string;
  currentBranch: string | null;
  isDetached: boolean;
  isOperationInProgress: boolean;
  changes: RepositoryChange[];
}
