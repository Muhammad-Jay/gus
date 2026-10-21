export class PlanView {
  display(plan: any) {
    console.log('\n📋 Proposed Workflow:');
    console.log(`  Summary: ${plan.summary}`);
    console.log(`  Branch: ${plan.branch.strategy === 'new' ? `create ${plan.branch.name}` : 'current branch'}`);
    console.log(`  Commits: ${plan.commits.length}`);
    for (let i = 0; i < plan.commits.length; i++) {
      console.log(`    ${i + 1}. ${plan.commits[i].message} (${plan.commits[i].files.length} files)`);
    }
    console.log();
  }
}
