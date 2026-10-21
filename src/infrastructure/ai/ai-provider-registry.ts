export interface AiProvider {
  name: string;
  createPlanner(model?: string): any;
}

export class AiProviderRegistry {
  private providers = new Map<string, AiProvider>();

  register(provider: AiProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AiProvider | undefined {
    return this.providers.get(name);
  }

  list(): string[] {
    return Array.from(this.providers.keys());
  }
}
