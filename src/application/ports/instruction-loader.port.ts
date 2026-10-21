export interface InstructionSet {
  globalInstructions: string;
  projectInstructions: string;
  combined: string;
  sources: string[];
}

export interface InstructionLoader {
  loadInstructions(repoRoot?: string): Promise<InstructionSet>;
}
