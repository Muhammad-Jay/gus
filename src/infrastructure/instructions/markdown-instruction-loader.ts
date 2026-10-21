import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { InstructionLoader, InstructionSet } from '../../application/ports/instruction-loader.port.js';

export class MarkdownInstructionLoader implements InstructionLoader {
  async loadInstructions(repoRoot?: string): Promise<InstructionSet> {
    const sources: string[] = [];
    let globalInstructions = '';
    let projectInstructions = '';

    // Load global instructions
    const globalPath = join(homedir(), '.config', 'gus', 'GUS.md');
    if (existsSync(globalPath)) {
      try {
        globalInstructions = await readFile(globalPath, 'utf-8');
        sources.push(globalPath);
      } catch {
        // Ignore errors
      }
    }

    // Load project instructions
    if (repoRoot) {
      const projectPath = join(repoRoot, '.gus', 'GUS.md');
      if (existsSync(projectPath)) {
        try {
          projectInstructions = await readFile(projectPath, 'utf-8');
          sources.push(projectPath);
        } catch {
          // Ignore errors
        }
      }
    }

    const combined = [globalInstructions, projectInstructions]
      .filter((s) => s.trim())
      .join('\n\n---\n\n');

    return {
      globalInstructions,
      projectInstructions,
      combined,
      sources,
    };
  }
}
