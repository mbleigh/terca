#!/usr/bin/env node

import { runTests } from "../lib/runner.js";

runTests().catch((e: any) => {
  console.error(e);
  process.exit(1);
});
