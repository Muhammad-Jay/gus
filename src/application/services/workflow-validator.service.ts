import type { RepositoryCapabilities } from '../../domain/repository/repository-capabilities.js';
import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';
import { validateCommitMessage } from '../../domain/templates/commit-message-validator.js';
import type { CommitTemplate } from '../../domain/templates/commit-template.js';
import { describeBranchNameProblem } from '../../domain/workflow/branch-name.js';
import type { StagedPath } from '../../domain/workflow/commit-group.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class WorkflowValidator {
  validate(
    plan: WorkflowPlan,
    snapshot: RepositorySnapshot,
    template?: CommitTemplate | null,
    capabilities?: RepositoryCapabilities,
  ): ValidationResult {
    const errors: string[] = [];
    const changePaths = new Set(snapshot.changes.map((change) => change.path));

    for (const commit of plan.commits) {
      if (commit.files.length === 0) {
        errors.push(`Commit "${commit.message}" has no files.`);
      }

      if (commit.message.trim() === '') {
        errors.push('Commit messages must not be empty.');
      } else if (template !== undefined && template !== null) {
        errors.push(...validateCommitMessage(commit.message, template));
      }

      const seenInGroup = new Set<string>();
      for (const file of commit.files) {
        if (!changePaths.has(file.path)) {
          errors.push(`Path not found in changes: ${file.path}`);
        }
        if (seenInGroup.has(file.path)) {
          errors.push(`File appears more than once in commit "${commit.message}": ${file.path}`);
        }
        seenInGroup.add(file.path);
      }
    }

    const assignedFiles = new Set<string>();
    for (const commit of plan.commits) {
      for (const file of commit.files) {
        if (assignedFiles.has(file.path)) {
          errors.push(`File assigned to multiple commits: ${file.path}`);
        }
        assignedFiles.add(file.path);
      }
    }

    for (const change of snapshot.changes) {
      if (!assignedFiles.has(change.path)) {
        errors.push(`Change not assigned to any commit: ${change.path}`);
      }
    }

    if (plan.branch.strategy === 'new') {
      if (capabilities !== undefined) {
        if (!capabilities.canCreateBranch) {
          errors.push('The repository does not support creating branches.');
        }
        if (!capabilities.canCheckoutBranch) {
          errors.push('The repository does not support checking out branches.');
        }
      }
      if (plan.branch.name === undefined || plan.branch.name.trim() === '') {
        errors.push('Branch name is required when creating a new branch.');
      } else {
        const problem = describeBranchNameProblem(plan.branch.name);
        if (problem !== null) {
          errors.push(`Invalid branch name: ${plan.branch.name} - ${problem}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
