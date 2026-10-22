import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';
import { isValidBranchName } from '../../domain/workflow/branch-name.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class WorkflowValidator {
  validate(plan: WorkflowPlan, snapshot: RepositorySnapshot): ValidationResult {
    const errors: string[] = [];
    const changePaths = new Set(snapshot.changes.map((change) => change.path));

    for (const commit of plan.commits) {
      if (commit.files.length === 0) {
        errors.push(`Commit "${commit.message}" has no files.`);
      }

      if (commit.message.trim() === '') {
        errors.push('Commit messages must not be empty.');
      }

      const seenInGroup = new Set<string>();
      for (const file of commit.files) {
        if (!changePaths.has(file)) {
          errors.push(`Path not found in changes: ${file}`);
        }
        if (seenInGroup.has(file)) {
          errors.push(`File appears more than once in commit "${commit.message}": ${file}`);
        }
        seenInGroup.add(file);
      }
    }

    const assignedFiles = new Set<string>();
    for (const commit of plan.commits) {
      for (const file of commit.files) {
        if (assignedFiles.has(file)) {
          errors.push(`File assigned to multiple commits: ${file}`);
        }
        assignedFiles.add(file);
      }
    }

    for (const change of snapshot.changes) {
      if (!assignedFiles.has(change.path)) {
        errors.push(`Change not assigned to any commit: ${change.path}`);
      }
    }

    if (plan.branch.strategy === 'new') {
      if (plan.branch.name === undefined || plan.branch.name.trim() === '') {
        errors.push('Branch name is required when creating a new branch.');
      } else if (!isValidBranchName(plan.branch.name)) {
        errors.push(`Invalid branch name: ${plan.branch.name}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
