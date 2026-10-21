export const ExitCode = {
  Success: 0,
  InternalError: 1,
  InvalidInput: 2,
  RepositoryError: 3,
  AiError: 4,
  ApprovalRequired: 5,
  WorkflowFailed: 6,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export const EXIT_CODE_DESCRIPTIONS: Record<ExitCodeValue, string> = {
  [ExitCode.Success]: 'The command completed successfully.',
  [ExitCode.InternalError]: 'An unexpected internal error occurred.',
  [ExitCode.InvalidInput]: 'Invalid command-line arguments or invalid configuration.',
  [ExitCode.RepositoryError]:
    'No supported repository was found, or the repository is in an unsafe state.',
  [ExitCode.AiError]: 'The AI provider failed, authentication failed, or the response was invalid.',
  [ExitCode.ApprovalRequired]:
    'An operation was denied by policy, or approval was required but could not be obtained.',
  [ExitCode.WorkflowFailed]:
    'The workflow could not be completed; the repository may be in a partial state.',
};

export function isExitCodeValue(value: number): value is ExitCodeValue {
  return Object.values(ExitCode).some((code) => code === value);
}
