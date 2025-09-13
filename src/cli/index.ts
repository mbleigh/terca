#!/usr/bin/env node

import { runTests } from "../lib/runner";

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});

