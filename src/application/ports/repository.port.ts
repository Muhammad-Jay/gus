import type { ChangeContent } from '../../domain/repository/change-content.js';
import type { RepositoryCapabilities } from '../../domain/repository/repository-capabilities.js';
import type { RepositoryChange } from '../../domain/repository/repository-change.js';
import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';

export interface RepositoryLocation {
  rootPath: string;
  displayName: string;
}

export interface CommitResult {
  sha: string;
  message: string;
}

export interface RepositoryAdapter {
  detect(cwd: string): Promise<RepositoryLocation | null>;
  getCapabilities(): Promise<RepositoryCapabilities>;
  inspect(): Promise<RepositorySnapshot>;
  getChangeContents(changes: RepositoryChange[]): Promise<ChangeContent[]>;
  validateBranchName(name: string): Promise<void>;
  branchExists(name: string): Promise<boolean>;
  createBranch(name: string): Promise<void>;
  checkoutBranch(name: string): Promise<void>;
  stagePaths(paths: string[]): Promise<void>;
  getStagedPaths(): Promise<string[]>;
  commit(message: string): Promise<CommitResult>;
  verify(): Promise<RepositorySnapshot>;
}
