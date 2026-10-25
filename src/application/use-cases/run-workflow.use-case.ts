import {
  InsufficientContextError,
  InvalidBranchNameError,
  NoRepositoryError,
  PlanValidationError,
  UnsafeRepositoryStateError,
  VerificationError,
} from '../../domain/errors/domain-errors.js';
import { PolicyEvaluator } from '../../domain/policy/policy-evaluator.js';
import type { RepositorySnapshot } from '../../domain/repository/repository-snapshot.js';
import { hasRepositoryStateChanged } from '../../domain/repository/snapshot-comparison.js';
import type { WorkflowDecision } from '../../domain/workflow/workflow-decision.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import type { WorkflowVerification } from '../../domain/workflow/workflow-verification.js';
import { toErrorMessage } from '../../shared/errors.js';
import type { AiPlannerFactory } from '../ports/ai-planner.port.js';
import type { ApprovalPort } from '../ports/approval.port.js';
import type { ConfigurationService } from '../ports/configuration.port.js';
import type { InstructionLoader } from '../ports/instruction-loader.port.js';
import type { ProgressReporter } from '../ports/progress.port.js';
import type { RepositoryAdapter } from '../ports/repository.port.js';
import type { TemplateLoaderPort } from '../ports/template-loader.port.js';
import { WorkflowExecutor } from '../services/workflow-executor.service.js';
import { WorkflowValidator } from '../services/workflow-validator.service.js';
import { WorkflowVerifier } from '../services/workflow-verifier.service.js';

export type WorkflowStatus = 'completed' | 'failed' | 'no-changes' | 'planned';

export interface WorkflowRunResult {
  status: WorkflowStatus;
  snapshot: RepositorySnapshot;
  plan?: WorkflowPlan;
  provider?: string;
  modelId?: string;
  decision?: WorkflowDecision;
  verification?: RepositorySnapshot;
  workflowVerification?: WorkflowVerification;
  failure?: string;
}

export interface RunWorkflowOptions {
  cwd: string;
  dryRun?: boolean;
}

export interface RunWorkflowDependencies {
  repository: RepositoryAdapter;
  configService: ConfigurationService;
  instructionLoader: InstructionLoader;
  templateLoader: TemplateLoaderPort;
  plannerFactory: AiPlannerFactory;
  approval: ApprovalPort;
  progress: ProgressReporter;
}

export class RunWorkflowUseCase {
  constructor(private readonly dependencies: RunWorkflowDependencies) {}

  async execute(options: RunWorkflowOptions): Promise<WorkflowRunResult> {
    try {
      return await this.run(options);
    } catch (error) {
      this.dependencies.progress.emit({ type: 'workflow.failed', message: toErrorMessage(error) });
      throw error;
    }
  }

  private async run(options: RunWorkflowOptions): Promise<WorkflowRunResult> {
    const { repository, configService, instructionLoader, templateLoader, plannerFactory } =
      this.dependencies;
    const { progress } = this.dependencies;

    progress.emit({ type: 'repository.detecting' });
    const location = await repository.detect(options.cwd);
    if (location === null) {
      throw new NoRepositoryError(`No Git repository found at or above ${options.cwd}.`);
    }

    progress.emit({ type: 'repository.inspecting' });
    const snapshot = await repository.inspect();

    if (snapshot.changes.length === 0) {
      return { status: 'no-changes', snapshot };
    }

    progress.emit({ type: 'repository.collecting' });
    const changeContents = await repository.getChangeContents(snapshot.changes);
    const omittedPaths = changeContents
      .filter((content) => content.contentOmitted)
      .map((content) => content.path);
    if (omittedPaths.length > 0) {
      throw new InsufficientContextError(
        `Gus could not collect the full content of ${omittedPaths.length} changed file(s) (${omittedPaths.join(', ')}). The change set is too large to plan reliably. Review the changes manually or split the work into smaller steps.`,
        omittedPaths,
      );
    }

    const preStaged = await repository.getStagedPaths();
    if (preStaged.length > 0) {
      throw new UnsafeRepositoryStateError(
        `The repository already has ${preStaged.length} staged path(s). Gus will not mix pre-existing staged work into this workflow. Unstage or commit them first.`,
      );
    }

    const hasConflicts = snapshot.changes.some((change) => change.status === 'unmerged');
    if (hasConflicts) {
      throw new UnsafeRepositoryStateError(
        'The repository has unresolved merge conflicts. Resolve them before running Gus.',
      );
    }

    progress.emit({ type: 'configuration.loading' });
    const configuration = await configService.getMerged(snapshot.rootPath);

    progress.emit({ type: 'instructions.loading' });
    const instructions = await instructionLoader.loadInstructions(snapshot.rootPath);

    progress.emit({ type: 'template.loading' });
    const template = await templateLoader.loadTemplate(snapshot.rootPath);

    progress.emit({ type: 'ai.planning' });
    const resolved = plannerFactory.create(configuration);
    const plan = await resolved.planner.plan({
      repositorySnapshot: snapshot,
      changes: snapshot.changes,
      changeContents,
      instructions: instructions.combined,
      ...(template !== null ? { template } : {}),
      ...(configuration.workflow?.commitStyle !== undefined
        ? { commitStyle: configuration.workflow.commitStyle }
        : {}),
      ...(configuration.workflow?.defaultBranch !== undefined
        ? { defaultBranch: configuration.workflow.defaultBranch }
        : {}),
      currentBranch: snapshot.currentBranch,
    });

    progress.emit({ type: 'plan.validating' });
    const validation = new WorkflowValidator().validate(plan, snapshot, template);
    if (!validation.valid) {
      throw new PlanValidationError(
        `The AI workflow plan is not safe to execute: ${validation.errors.join('; ')}`,
        validation.errors,
      );
    }

    if (plan.branch.strategy === 'new' && plan.branch.name !== undefined) {
      await repository.validateBranchName(plan.branch.name);
    }

    const policy = new PolicyEvaluator().evaluate(plan, {
      autoCommit: configuration.workflow?.autoCommit ?? 'ask',
      autoCreateBranch: configuration.workflow?.autoCreateBranch ?? 'ask',
      autoStage: configuration.workflow?.autoStage ?? 'ask',
      splitChanges: configuration.workflow?.splitChanges ?? 'ask',
    });

    if (options.dryRun === true) {
      return {
        status: 'planned',
        snapshot,
        plan,
        provider: resolved.provider,
        modelId: resolved.modelId,
      };
    }

    const current = await repository.inspect();
    if (hasRepositoryStateChanged(snapshot, current)) {
      throw new UnsafeRepositoryStateError(
        'The repository changed while Gus was planning. Re-run the workflow so the plan matches the current state.',
      );
    }

    const executor = new WorkflowExecutor(repository);
    const decision = await executor.execute(plan, policy, {
      approval: this.dependencies.approval,
      progress,
      originalSnapshot: snapshot,
    });

    if (!decision.success) {
      progress.emit({
        type: 'workflow.failed',
        message: decision.failure ?? 'The workflow did not complete.',
      });
      return {
        status: 'failed',
        snapshot,
        plan,
        provider: resolved.provider,
        modelId: resolved.modelId,
        decision,
        failure: decision.failure,
      };
    }

    progress.emit({ type: 'repository.verifying' });
    const verification = await repository.verify();

    if (verification.changes.length > 0) {
      const remaining = verification.changes.map((change) => change.path).join(', ');
      throw new VerificationError(
        `The workflow finished but the repository is not clean. Remaining changes: ${remaining}`,
      );
    }

    // Verify the workflow execution matches the plan
    const verifier = new WorkflowVerifier(repository);
    const workflowVerification = await verifier.verify(plan, decision);

    if (!workflowVerification.overallSuccess) {
      const reasons: string[] = [];
      if (!workflowVerification.branch.matches) {
        reasons.push(workflowVerification.branch.mismatchReason ?? 'Branch mismatch');
      }
      for (const commit of workflowVerification.commits) {
        if (!commit.matches && commit.mismatchReason) {
          reasons.push(commit.mismatchReason);
        }
      }
      throw new VerificationError(`Workflow verification failed: ${reasons.join('; ')}`);
    }

    progress.emit({ type: 'workflow.completed', success: true });

    return {
      status: 'completed',
      snapshot,
      plan,
      provider: resolved.provider,
      modelId: resolved.modelId,
      decision,
      verification,
      workflowVerification,
    };
  }
}
