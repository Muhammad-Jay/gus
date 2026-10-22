import * as p from '@clack/prompts';
import type {
  ProgressReporter,
  WorkflowProgressEvent,
} from '../../application/ports/progress.port.js';

const MESSAGES: Partial<Record<WorkflowProgressEvent['type'], string>> = {
  'repository.detecting': 'Detecting repository',
  'repository.inspecting': 'Inspecting repository changes',
  'repository.collecting': 'Collecting change content',
  'configuration.loading': 'Loading configuration',
  'instructions.loading': 'Loading instructions',
  'template.loading': 'Loading commit template',
  'ai.planning': 'Planning the workflow with AI',
  'plan.validating': 'Validating the workflow plan',
  'repository.verifying': 'Verifying the result',
};

export class ClackProgressReporter implements ProgressReporter {
  private readonly spinner = p.spinner();
  private active = false;

  emit(event: WorkflowProgressEvent): void {
    switch (event.type) {
      case 'branch.creating':
        this.show(`Creating branch ${event.name}`);
        return;
      case 'commit.creating':
        this.show(`Creating commit ${event.index}/${event.total}`);
        return;
      case 'approval.required':
        this.stop();
        return;
      case 'workflow.completed':
        this.finish(event.success ? 'Workflow completed' : 'Workflow stopped');
        return;
      case 'workflow.failed':
        this.stop();
        return;
      default: {
        const message = MESSAGES[event.type];
        if (message !== undefined) {
          this.show(message);
        }
      }
    }
  }

  private show(message: string): void {
    if (this.active) {
      this.spinner.message(message);
      return;
    }

    this.spinner.start(message);
    this.active = true;
  }

  private stop(): void {
    if (!this.active) {
      return;
    }

    this.spinner.stop();
    this.active = false;
  }

  private finish(message: string): void {
    if (!this.active) {
      return;
    }

    this.spinner.stop(message);
    this.active = false;
  }
}
