#!/usr/bin/env node
import { createProgram } from './program.js';

async function main() {
  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
