export class ResultView {
  display(result: any) {
    console.log('\n✅ Result:');
    if (result.success) {
      console.log('  Status: Success');
    } else {
      console.log('  Status: Failed');
    }
    if (result.operations) {
      for (const op of result.operations) {
        console.log(`  • ${op}`);
      }
    }
    console.log();
  }
}
