import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { AiPlanner } from '../../application/ports/ai-planner.port.js';
import type { AiProvider, CreatePlannerOptions } from './ai-provider-registry.js';
import { AiSdkPlannerAdapter } from './ai-sdk-planner.adapter.js';

export interface OpenAiProviderOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  temperature?: number;
  maxRetries?: number;
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly defaultModel: string;
  private readonly client: ReturnType<typeof createOpenAI>;
  private readonly temperature?: number;
  private readonly maxRetries?: number;

  constructor(options: OpenAiProviderOptions = {}) {
    this.defaultModel = options.defaultModel ?? 'gpt-4o-mini';
    this.temperature = options.temperature;
    this.maxRetries = options.maxRetries;
    this.client = createOpenAI({ apiKey: options.apiKey, baseURL: options.baseURL });
  }

  createModel(modelId?: string): LanguageModel {
    return this.client(modelId ?? this.defaultModel);
  }

  createPlanner(options: CreatePlannerOptions = {}): AiPlanner {
    return new AiSdkPlannerAdapter({
      model: this.createModel(options.modelId),
      temperature: options.temperature ?? this.temperature,
      maxRetries: this.maxRetries,
    });
  }
}
