export interface CommitVerification {
  expectedMessage: string;
  actualSha?: string;
  actualMessage?: string;
  expectedFiles: string[];
  actualFiles: string[];
  matches: boolean;
  mismatchReason?: string;
}

export interface BranchVerification {
  expectedStrategy: 'current' | 'new';
  expectedName?: string;
  actualBranch: string | null;
  matches: boolean;
  mismatchReason?: string;
}

export interface WorkflowVerification {
  branch: BranchVerification;
  commits: CommitVerification[];
  overallSuccess: boolean;
}
