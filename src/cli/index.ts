#!/usr/bin/env node
/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import { runTests } from "../lib/runner.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const options: {
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
  test?: string[];
  experiment?: string[];
  environment?: string[];
} = {};

let command = "run";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-v" || arg === "--version") {
    command = "version";
    break;
  } else if (arg === "-n" || arg === "--repetitions") {
    options.repetitions = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === "-c" || arg === "--concurrency") {
    options.concurrency = parseInt(args[i + 1], 10);
    i++;
  } else if (arg === "-t" || arg === "--test") {
    options.test = args[i + 1].split(",");
    i++;
  } else if (arg === "-x" || arg === "--experiment") {
    options.experiment = args[i + 1].split(",");
    i++;
  } else if (arg === "-e" || arg === "--environment") {
    options.environment = args[i + 1].split(",");
    i++;
  }
}

if (command === "version") {
  const packageJsonPath = path.resolve(__dirname, "../../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  console.log(packageJson.version);
  process.exit(0);
} else {
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
}