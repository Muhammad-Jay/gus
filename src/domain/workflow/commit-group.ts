export interface StagedPath {
  path: string;
  oldPath?: string;
}

export interface CommitGroup {
  message: string;
  files: StagedPath[];
  explanation?: string;
}
