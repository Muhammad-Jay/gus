import {
  APICallError,
  type LanguageModelV1,
  LoadAPIKeyError,
  NoObjectGeneratedError,
  NoSuchModelError,
  TypeValidationError,
  generateObject,
} from 'ai';
import type { AiPlanner, WorkflowPlanningInput } from '../../application/ports/ai-planner.port.js';
import { createPromptBuilder } from '../../application/services/prompt-builder.service.js';
import {
  AiAuthenticationError,
  AiProviderError,
  AiTimeoutError,
  InvalidAiResponseError,
} from '../../domain/errors/domain-errors.js';
import type { WorkflowPlan } from '../../domain/workflow/workflow-plan.js';
import { WorkflowPlanSchema } from './schemas/workflow-plan.schema.js';

export interface AiSdkPlannerOptions {
  model: LanguageModelV1;
  temperature?: number;
  maxRetries?: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasTimeoutInChain(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (current.name === 'TimeoutError' || current.name === 'AI_Timeout') {
      return true;
    }
    if (/timed?\s*out|timeout/i.test(current.message)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

export class AiSdkPlannerAdapter implements AiPlanner {
  private readonly model: LanguageModelV1;
  private readonly temperature?: number;
  private readonly maxRetries: number;

  constructor(options: AiSdkPlannerOptions) {
    this.model = options.model;
    this.temperature = options.temperature;
    this.maxRetries = options.maxRetries ?? 1;
  }

  async plan(input: WorkflowPlanningInput): Promise<WorkflowPlan> {
    const promptBuilder = createPromptBuilder();
    const prompt = promptBuilder.build(input);

    try {
      const { object } = await generateObject({
        model: this.model,
        schema: WorkflowPlanSchema,
        prompt,
        ...(this.temperature !== undefined ? { temperature: this.temperature } : {}),
        maxRetries: this.maxRetries,
      });

      return WorkflowPlanSchema.parse(object);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): Error {
    if (hasTimeoutInChain(error)) {
      return new AiTimeoutError(`The request timed out: ${errorMessage(error)}`);
    }

    if (error instanceof LoadAPIKeyError) {
      return new AiAuthenticationError(
        `An API key is missing. Set OPENAI_API_KEY or configure an API key. (${errorMessage(error)})`,
      );
    }

    if (error instanceof APICallError) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        return new AiAuthenticationError(
          `The provider rejected the credentials (HTTP ${error.statusCode}): ${errorMessage(error)}`,
        );
      }
      return new AiProviderError(`The provider request failed: ${errorMessage(error)}`);
    }

    if (error instanceof NoSuchModelError) {
      return new AiProviderError(`The model is unavailable: ${errorMessage(error)}`);
    }

    if (error instanceof NoObjectGeneratedError || error instanceof TypeValidationError) {
      return new InvalidAiResponseError(
        `The provider returned an unusable workflow plan: ${errorMessage(error)}`,
      );
    }

    return new AiProviderError(`The provider request failed: ${errorMessage(error)}`);
  }
}
