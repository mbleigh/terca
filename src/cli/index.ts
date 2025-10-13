#!/usr/bin/env node

import { runTests } from "../lib/runner.js";

const args = process.argv.slice(2);
const options: {
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
  only?: string[];
} = {};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-n" || arg === "--repetitions") {
    options.repetitions = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === "-c" || arg === "--concurrency") {
    options.concurrency = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === "--only") {
    options.only = args[i + 1].split(",");
    i++;
  }
}

const controller = new AbortController();
options.signal = controller.signal;

let lastInterrupt = 0;
process.on("SIGINT", () => {
  const now = Date.now();
  if (now - lastInterrupt < 1000) {
    console.log("\nImmediate exit requested.");
    process.exit(1);
  }
  lastInterrupt = now;
  console.log(
    "\nGracefully stopping... (press Ctrl+C again within 1s to force)",
  );
  controller.abort();
});

runTests(options).catch((e: any) => {
  console.error(e);
  process.exit(1);
});
