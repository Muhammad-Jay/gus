export interface RepositoryCapabilities {
  canCreateBranch: boolean;
  canCheckoutBranch: boolean;
  canStagePaths: boolean;
  canCommit: boolean;
  supportsRenameDetection: boolean;
}
