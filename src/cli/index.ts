#!/usr/bin/env node

import { runTests } from "../lib/runner.js";

const args = process.argv.slice(2);
const options: { repetitions?: number; concurrency?: number } = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-n" || arg === "--repetitions") {
    options.repetitions = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === "-c" || arg === "--concurrency") {
    options.concurrency = parseInt(args[i + 1], 10);
    i++;
  }
}

runTests(options).catch((e: any) => {
  console.error(e);
  process.exit(1);
});
