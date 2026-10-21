export interface DiffInfo {
  path: string;
  additions: number;
  deletions: number;
}

export function parseDiffStat(diffStatOutput: string): DiffInfo[] {
  const results: DiffInfo[] = [];
  if (!diffStatOutput.trim()) {
    return results;
  }
  
  const lines = diffStatOutput.split('\n').filter((line) => line.trim());
  for (const line of lines) {
    // Skip summary line
    if (line.includes('files changed') || line.includes('insertions') || line.includes('deletions')) {
      continue;
    }
    // Basic parsing - can be enhanced later
    const match = line.match(/^\s*(.+?)\s+\|\s+(\d+)/);
    if (match) {
      results.push({
        path: match[1].trim(),
        additions: 0,
        deletions: 0,
      });
    }
  }
  return results;
}
