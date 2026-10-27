import { describe, expect, it } from 'vitest';
import {
  isGitExecutionFailure,
  isSuccessfulGitCommand,
} from '../../../../src/infrastructure/repository/providers/git-cli/git-result';
import { createProcessRunResult } from '../../../helpers/process-runner-fake';

describe('git result helpers', () => {
  it('detects process execution failures', () => {
    expect(isGitExecutionFailure(createProcessRunResult({ exitCode: null }))).toBe(true);
    expect(isGitExecutionFailure(createProcessRunResult({ spawnFailed: true }))).toBe(true);
    expect(isGitExecutionFailure(createProcessRunResult({ timedOut: true }))).toBe(true);
    expect(isGitExecutionFailure(createProcessRunResult({ isTerminated: true }))).toBe(true);
    expect(isGitExecutionFailure(createProcessRunResult({ exitCode: 1 }))).toBe(false);
  });

  it('only treats a clean zero exit as success', () => {
    expect(isSuccessfulGitCommand(createProcessRunResult({ exitCode: 0 }))).toBe(true);
    expect(isSuccessfulGitCommand(createProcessRunResult({ exitCode: 1 }))).toBe(false);
    expect(isSuccessfulGitCommand(createProcessRunResult({ exitCode: null }))).toBe(false);
    expect(isSuccessfulGitCommand(createProcessRunResult({ spawnFailed: true }))).toBe(false);
    expect(isSuccessfulGitCommand(createProcessRunResult({ timedOut: true }))).toBe(false);
    expect(isSuccessfulGitCommand(createProcessRunResult({ isTerminated: true }))).toBe(false);
  });
});
