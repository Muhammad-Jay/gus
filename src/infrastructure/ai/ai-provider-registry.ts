import type { LanguageModelV1 } from 'ai';
import type { AiPlanner } from '../../application/ports/ai-planner.port.js';

export interface CreatePlannerOptions {
  modelId?: string;
  temperature?: number;
}

export interface AiProvider {
  name: string;
  defaultModel: string;
  createModel(modelId?: string): LanguageModelV1;
  createPlanner(options?: CreatePlannerOptions): AiPlanner;
}

export class AiProviderRegistry {
  private providers = new Map<string, AiProvider>();

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AiProvider | undefined {
    return this.providers.get(name);
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
