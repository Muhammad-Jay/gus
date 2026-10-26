import { Command } from 'commander';
import type { ApprovalPort } from '../../application/ports/approval.port.js';
import type { ProgressReporter } from '../../application/ports/progress.port.js';
import { NullProgressReporter } from '../../application/ports/progress.port.js';
import { RunWorkflowUseCase } from '../../application/use-cases/run-workflow.use-case.js';
import type { ConfigurationPatch } from '../../domain/config/configuration.js';
import { ExitCode } from '../../shared/exit-codes.js';
import {
  createConfigService,
  createInstructionLoader,
  createModelResolver,
  createRepository,
  createTemplateLoader,
} from '../composition.js';
import { PlanView } from '../ui/plan-view.js';
import { ClackProgressReporter } from '../ui/progress.js';
import { AutoApproval, ClackApproval, NonInteractiveApproval } from '../ui/prompts.js';
import { ResultView } from '../ui/result-view.js';

export interface RunOptions {
  dryRun?: boolean;
  yes?: boolean;
  provider?: string;
  model?: string;
}

function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

function createApproval(options: RunOptions): ApprovalPort {
  if (options.yes === true) {
    return new AutoApproval();
  }
  return isInteractive() ? new ClackApproval() : new NonInteractiveApproval();
}

function createProgress(liveUpdates: boolean): ProgressReporter {
  return isInteractive() && liveUpdates ? new ClackProgressReporter() : new NullProgressReporter();
}

function createOverrides(options: RunOptions): ConfigurationPatch | undefined {
  if (options.provider === undefined && options.model === undefined) {
    return undefined;
  }

  return {
    ai: {
      ...(options.provider !== undefined ? { provider: options.provider } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
    },
  };
}

export async function executeRun(options: RunOptions): Promise<void> {
  const configService = createConfigService(createOverrides(options));
  const tempRepository = createRepository();
  const location = await tempRepository.detect(process.cwd());
  const configuration = await configService.getMerged(location?.rootPath);
  const liveUpdates = configuration.ui?.liveUpdates !== false;
  const excludedPaths = configuration.privacy?.excludedPaths ?? [];

  const useCase = new RunWorkflowUseCase({
    createRepository: (paths) => createRepository(paths),
    configService,
    instructionLoader: createInstructionLoader(),
    templateLoader: createTemplateLoader(),
    plannerFactory: createModelResolver(),
    approval: createApproval(options),
    progress: createProgress(liveUpdates),
  });

  const result = await useCase.execute({
    cwd: process.cwd(),
    dryRun: options.dryRun === true,
  });

  if (result.status === 'no-changes') {
    console.log('No changes to work with.');
    return;
  }

  if (result.plan !== undefined) {
    new PlanView().display(result.plan, result.provider, result.modelId);
  }

  if (result.status === 'planned') {
    console.log('Dry run: no changes were made.');
    return;
  }

  new ResultView().display(result);

  if (result.status === 'failed') {
    process.exitCode = ExitCode.WorkflowFailed;
  }
}

export function runCommand(): Command {
  const command = new Command('run');
  command
    .description('Run the default workflow')
    .option('--dry-run', 'Show the plan without changing the repository')
    .option('-y, --yes', 'Approve all operations without prompting')
    .option('--provider <name>', 'Override the AI provider for this run')
    .option('--model <id>', 'Override the AI model for this run')
    .action(async (options: RunOptions) => {
      await executeRun(options);
    });

  return command;
}
