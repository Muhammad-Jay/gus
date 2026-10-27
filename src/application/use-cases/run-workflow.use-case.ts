import type { Configuration } from '../../domain/config/configuration.js';
import {
  InsufficientContextError,
  InvalidBranchNameError,
  NoRepositoryError,
  PlanValidationError,
  UnsafeRepositoryStateError,
  UnsupportedRepositoryError,
  VerificationError,
} from '../../domain/errors/domain-errors.js';
import { PolicyEvaluator } from '../../domain/policy/policy-evaluator.js';
import { isPathExcluded } from '../../domain/repository/path-exclusions.js';
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
import { SecretRedactor } from '../services/secret-redactor.service.js';
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
  createRepository: (excludedPaths?: string[]) => RepositoryAdapter;
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
    const { createRepository, configService, instructionLoader, templateLoader, plannerFactory } =
      this.dependencies;
    const { progress } = this.dependencies;

    progress.emit({ type: 'repository.detecting' });
    const tempRepository = createRepository();
    const location = await tempRepository.detect(options.cwd);
    if (location === null) {
      throw new NoRepositoryError(`No Git repository found at or above ${options.cwd}.`);
    }

    progress.emit({ type: 'configuration.loading' });
    const configuration = await configService.getMerged(location.rootPath);

    const excludedPaths = configuration.privacy?.excludedPaths ?? [];
    const redactSecrets = configuration.privacy?.redactSecrets ?? true;
    const acknowledgeDataUsage = configuration.privacy?.acknowledgeDataUsage ?? false;

    const repository = createRepository(excludedPaths);

    await repository.detect(location.rootPath);
    const capabilities = await repository.getCapabilities();
    if (!capabilities.canStagePaths) {
      throw new UnsupportedRepositoryError(
        'The repository does not support staging paths. Gus cannot prepare commits safely.',
      );
    }
    if (!capabilities.canCommit) {
      throw new UnsupportedRepositoryError(
        'The repository does not support committing. Configure a Git author and committer identity before running Gus.',
      );
    }

    progress.emit({ type: 'repository.inspecting' });
    const snapshot = await repository.inspect();

    if (snapshot.changes.length === 0) {
      return { status: 'no-changes', snapshot };
    }

    progress.emit({ type: 'repository.collecting' });
    const changeContents = await repository.getChangeContents(snapshot.changes);
    const excludedPathsSeen = new Set(
      changeContents
        .filter((content) => content.contentExcluded === true)
        .map((content) => content.path),
    );
    const includedChanges = snapshot.changes.filter(
      (change) => !excludedPathsSeen.has(change.path),
    );

    if (excludedPathsSeen.size > 0) {
      progress.emit({
        type: 'privacy.warning',
        message: `Skipped ${excludedPathsSeen.size} excluded path(s); their content will not be sent to the AI provider and they will not be committed: ${[...excludedPathsSeen].join(', ')}`,
      });
    }

    if (includedChanges.length === 0) {
      return { status: 'no-changes', snapshot };
    }

    const omittedPaths = changeContents
      .filter((content) => content.contentOmitted && content.contentExcluded !== true)
      .map((content) => content.path);
    if (omittedPaths.length > 0) {
      throw new InsufficientContextError(
        `Gus could not collect the full content of ${omittedPaths.length} changed file(s) (${omittedPaths.join(', ')}). The change set is too large to plan reliably. Review the changes manually or split the work into smaller steps.`,
        omittedPaths,
      );
    }

    const planningSnapshot: RepositorySnapshot = { ...snapshot, changes: includedChanges };

    try {
      const preStaged = await repository.getStagedPaths();
      if (preStaged.length > 0) {
        throw new UnsafeRepositoryStateError(
          `The repository already has ${preStaged.length} staged path(s). Gus will not mix pre-existing staged work into this workflow. Unstage or commit them first.`,
        );
      }
    } catch (error) {
      if (error instanceof UnsafeRepositoryStateError) {
        throw error;
      }
    }

    const hasConflicts = snapshot.changes.some((change) => change.status === 'unmerged');
    if (hasConflicts) {
      throw new UnsafeRepositoryStateError(
        'The repository has unresolved merge conflicts. Resolve them before running Gus.',
      );
    }

    progress.emit({ type: 'instructions.loading' });
    const instructions = await instructionLoader.loadInstructions(snapshot.rootPath);

    progress.emit({ type: 'template.loading' });
    const template = await templateLoader.loadTemplate(snapshot.rootPath);

    if (!acknowledgeDataUsage && this.isFreeTierProvider(configuration)) {
      this.dependencies.progress.emit({
        type: 'privacy.warning',
        message:
          'Repository content will be sent to a free-tier AI provider. Free-tier providers may use submitted data to improve their products. Set privacy.acknowledgeDataUsage: true in your configuration to acknowledge this.',
      });
    }

    progress.emit({ type: 'ai.planning' });
    const resolved = plannerFactory.create(configuration);
    const plan = await resolved.planner.plan({
      repositorySnapshot: planningSnapshot,
      changes: includedChanges,
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
      capabilities,
      redactSecrets,
    });

    progress.emit({ type: 'plan.validating' });
    const validation = new WorkflowValidator().validate(
      plan,
      planningSnapshot,
      template,
      capabilities,
    );
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

    const remainingChanges = verification.changes.filter(
      (change) =>
        !excludedPathsSeen.has(change.path) && !isPathExcluded(change.path, excludedPaths),
    );
    if (remainingChanges.length > 0) {
      const remaining = remainingChanges.map((change) => change.path).join(', ');
      throw new VerificationError(
        `The workflow finished but the repository is not clean. Remaining changes: ${remaining}`,
      );
    }

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

  private isFreeTierProvider(configuration: Configuration): boolean {
    const provider = configuration.ai?.provider ?? 'google';
    const model = configuration.ai?.model ?? 'gemini-2.5-flash';
    return (
      provider === 'google' ||
      (provider === 'openai' && model.includes('free')) ||
      model.includes('gemini') ||
      model.includes('free-tier')
    );
  }
}
