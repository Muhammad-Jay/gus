import * as p from '@clack/prompts';

export class PromptsUI {
  async confirm(message: string): Promise<boolean> {
    const result = await p.confirm({ message });
    return result as boolean;
  }
}
