export type PolicyValue = 'allow' | 'ask' | 'deny';

export interface PolicyRules {
  autoCommit: PolicyValue;
  autoCreateBranch: PolicyValue;
  autoStage: PolicyValue;
  splitChanges: PolicyValue;
}
