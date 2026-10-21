import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';

export class WorkflowValidator {
  validate(plan: WorkflowPlan, snapshot: RepositorySnapshot): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate that all paths in commit groups exist in changes
    const allChangePaths = new Set(snapshot.changes.map((c) => c.path));
    for (const commit of plan.commits) {
      for (const file of commit.files) {
        if (!allChangePaths.has(file)) {
          errors.push(`Path not found in changes: ${file}`);
        }
      }
    }

    // Validate no duplicate file assignments
    const assignedFiles = new Set<string>();
    for (const commit of plan.commits) {
      for (const file of commit.files) {
        if (assignedFiles.has(file)) {
          errors.push(`File assigned to multiple commits: ${file}`);
        }
        assignedFiles.add(file);
      }
    }

    // Validate branch name when creating new branch
    if (plan.branch.strategy === 'new' && !plan.branch.name) {
      errors.push('Branch name required when creating new branch');
    }

    // Check all changes are assigned or explicitly handled
    const unassigned = snapshot.changes.filter((c) => !assignedFiles.has(c.path));
    if (unassigned.length > 0 && plan.commits.length > 0) {
      // This is a warning-level issue in practice; for MVP, allow but could track
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
