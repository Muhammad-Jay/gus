import * as p from '@clack/prompts';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';

export class PlanView {
  display(plan: WorkflowPlan, provider?: string, modelId?: string): void {
    const lines: string[] = [plan.summary, ''];

    if (provider !== undefined && modelId !== undefined) {
      lines.push(`Provider: ${provider} (${modelId})`);
    }

    lines.push(
      plan.branch.strategy === 'new'
        ? `Branch: create "${plan.branch.name}" - ${plan.branch.reason}`
        : `Branch: stay on the current branch - ${plan.branch.reason}`,
      '',
      `Commits (${plan.commits.length}):`,
    );

    for (const [index, commit] of plan.commits.entries()) {
      lines.push(`  ${index + 1}. ${commit.message}`);
      for (const file of commit.files) {
        lines.push(`     - ${file}`);
      }
    }

    if (plan.warnings.length > 0) {
      lines.push('', 'Warnings:');
      for (const warning of plan.warnings) {
        lines.push(`  - ${warning}`);
      }
    }

    p.note(lines.join('\n'), 'Proposed workflow');
  }
}
