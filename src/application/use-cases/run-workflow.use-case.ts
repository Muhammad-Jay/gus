import { PolicyEvaluator } from '../../domain/policy/policy-evaluator.js';
import type { AiPlanner } from '../ports/ai-planner.port.js';
import type { ConfigurationService } from '../ports/configuration.port.js';
import type { InstructionLoader } from '../ports/instruction-loader.port.js';
import type { RepositoryAdapter } from '../ports/repository.port.js';
import { WorkflowExecutor } from '../services/workflow-executor.service.js';
import { WorkflowValidator } from '../services/workflow-validator.service.js';

export class RunWorkflowUseCase {
  constructor(
    private repository: RepositoryAdapter,
    private aiPlanner: AiPlanner,
    private configService: ConfigurationService,
    private instructionLoader: InstructionLoader,
  ) {}

  async execute() {
    // 1. Inspect repository
    const snapshot = await this.repository.inspect();

    // 2. Load config and instructions
    const config = await this.configService.getMerged();
    const instructions = await this.instructionLoader.loadInstructions(snapshot.rootPath);

    // 3. Plan with AI
    const plan = await this.aiPlanner.plan({
      repositorySnapshot: snapshot,
      changes: snapshot.changes,
      instructions: instructions.combined,
      currentBranch: snapshot.currentBranch,
    });

    // 4. Validate plan
    const validator = new WorkflowValidator();
    const validation = validator.validate(plan, snapshot);
    if (!validation.valid) {
      throw new Error(`Plan validation failed: ${validation.errors.join(', ')}`);
    }

    // 5. Evaluate policy
    const policyEvaluator = new PolicyEvaluator();
    const policy = policyEvaluator.evaluate(plan, {
      autoCommit: config.workflow?.autoCommit ?? 'ask',
      autoCreateBranch: config.workflow?.autoCreateBranch ?? 'ask',
      autoStage: config.workflow?.autoStage ?? 'ask',
      splitChanges: config.workflow?.splitChanges ?? 'ask',
    });

    // 6. Execute
    const executor = new WorkflowExecutor(this.repository);
    const result = await executor.execute(plan, policy);

    // 7. Verify
    await this.repository.verify();

    return result;
  }
}
