#!/usr/bin/env node

import { runTests } from "../lib/runner.js";

const args = process.argv.slice(2);
const options: {
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
} = {};

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

const controller = new AbortController();
options.signal = controller.signal;

process.on("SIGINT", () => {
  controller.abort();
});

runTests(options).catch((e: any) => {
  console.error(e);
  process.exit(1);
});
