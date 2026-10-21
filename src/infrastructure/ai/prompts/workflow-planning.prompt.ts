export function createWorkflowPlanningPrompt(input: any): string {
  return `You are an expert at organizing git repository changes into clean, logical commits.

Analyze the repository changes and create a workflow plan.

Repository changes:
${JSON.stringify(input.changes, null, 2)}

Instructions:
${input.instructions || 'None'}

Current branch: ${input.currentBranch || 'unknown'}

You must:
1. Decide if changes should go on current branch or a new branch
2. Group related changes into separate commits
3. Write clear, conventional commit messages
4. Only use files that exist in the changes
5. Assign each file to at most one commit
6. Never suggest running shell commands

Return a structured plan with branch strategy, commits with files and messages, and warnings if any.`;
}
