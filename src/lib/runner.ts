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

import { expandEnvironmentsAndExperiments, loadConfig } from "./config.js";
import { GeminiAgentRunner } from "./runners/gemini.js";
import { ClaudeAgentRunner } from "./runners/claude.js";
import { CodexAgentRunner } from "./runners/codex.js";
import { OpencodeAgentRunner } from "./runners/opencode.js";
import {
  AgentRunner,
  AgentRunnerStats,
  Config,
  ExpandedMatrix,
  TercaTest,
  RunDisplayState,
} from "./types.js";
import { runBeforeActions } from "./before-actions.js";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import { printHeader, printResults } from "./ui.js";
import * as evalActions from "./eval-actions.js";
import logUpdate from "log-update";
import { green, red, gray } from "./colors.js";

const AGENT_RUNNERS: Record<string, new () => AgentRunner> = {
  gemini: GeminiAgentRunner,
  claude: ClaudeAgentRunner,
  codex: CodexAgentRunner,
  opencode: OpencodeAgentRunner,
};

export async function runTests(options: {
  repetitions?: number;
  concurrency?: number;
  signal?: AbortSignal;
  test?: string[];
  experiment?: string[];
  environment?: string[];
}) {
  const config = await loadConfig();
  const variants = expandEnvironmentsAndExperiments(config);
  const runDir = await createRunDir();
  const concurrency = options.concurrency || config.concurrency || 3;

  printHeader(`Terca Run: ${runDir}`);

  const allTestRuns = [];
  let runId = 0;
  const suiteRepetitions = options.repetitions || config.repetitions || 1;

  const testsToRun = options.test
    ? config.tests.filter((test) => options.test?.includes(test.name))
    : config.tests;

  let variantsToRun = variants;
  if (options.experiment) {
    variantsToRun = variantsToRun.filter((variant) =>
      options.experiment?.includes(variant.experiment),
    );
  }
  if (options.environment) {
    variantsToRun = variantsToRun.filter((variant) =>
      options.environment?.includes(variant.environment),
    );
  }

  for (const test of testsToRun) {
    const testRepetitions = test.repetitions || 1;
    const totalRepetitions = suiteRepetitions * testRepetitions;
    for (const variant of variantsToRun) {
      for (let i = 0; i < totalRepetitions; i++) {
        runId++;
        const repetition = i + 1;
        allTestRuns.push({
          id: runId,
          test,
          variant,
          repetition,
          name: `${test.name} (${variant.environment}.${
            variant.experiment
          } rep ${repetition})`,
        });
      }
    }
  }

  const runStates: RunDisplayState[] = allTestRuns.map((run) => ({
    id: run.id,
    name: run.name,
    status: "pending",
    message: "(pending)",
  }));

  const renderInterval = setInterval(() => {
    let output = `=== ${config.name || "Terca"} ===\n`;
    output += `see ${path.join(runDir, "results.json")}\n`;

    for (const state of runStates) {
      let line = `${state.id.toString().padStart(3, "0")} ${state.name}: `;
      if (state.status === "complete") {
        const evalResults = state.results || {};
        const failedEvals = Object.entries(evalResults).filter(
          ([, result]) => ((result as any).score as number) <= 0,
        );
        const passed = failedEvals.length === 0;

        if (passed) {
          line += green("✅ PASS");
        } else {
          line += red("❌ FAIL");
        }

        const statsParts = [];
        if (state.stats?.durationSeconds) {
          statsParts.push(
            `latency: ${state.stats.durationSeconds.toFixed(2)}s`,
          );
        }
        const totalTokens =
          (state.stats?.inputTokens || 0) + (state.stats?.outputTokens || 0);
        if (totalTokens > 0) {
          statsParts.push(`tokens: ${totalTokens}`);
        }
        if (statsParts.length > 0) {
          line += gray(` (${statsParts.join(", ")})`);
        }
        line += "\n";

        if (!passed) {
          for (const [name] of failedEvals) {
            line += `  - ${red("FAIL")}: ${name}\n`;
          }
        }
      } else if (state.status === "error") {
        line += `error: ${state.error?.message}\n`;
        if (state.logFile) {
          line += `  - log: ${state.logFile}\n`;
        }
      } else {
        line += `${state.message}\n`;
        if (state.logFile) {
          line += `  - log: ${state.logFile}\n`;
        }
      }
      output += line;
    }
    logUpdate(output);
  }, 100);

  const results: { runs: any[] } = { runs: [] };
  const resultsFile = path.join(runDir, "results.json");
  const queue = [...allTestRuns];

  options.signal?.addEventListener("abort", () => {
    // Stop any new tests from running
    queue.length = 0;
    logUpdate("\nCtrl+C received, finishing in-progress tests...\n");
  });

  async function worker() {
    while (queue.length > 0) {
      const run = queue.shift()!;
      const runState = runStates.find((s) => s.id === run.id)!;

      try {
        const { evalResult, stats } = await runTest(
          runDir,
          config,
          run.test,
          run.variant,
          run.id,
          run.repetition,
          runState,
          options.signal,
        );

        runState.status = "complete";
        runState.message = "complete";
        runState.results = evalResult;
        runState.stats = stats;

        results.runs.push({
          id: run.id,
          test: run.test.name,
          environment: run.variant.environment,
          experiment: run.variant.experiment,
          repetition: run.repetition,
          variant: run.variant,
          results: evalResult,
          stats,
        });
      } catch (e: any) {
        runState.status = "error";
        runState.message = `error: ${e.message}`;
        runState.error = e;
        results.runs.push({
          id: run.id,
          test: run.test.name,
          environment: run.variant.environment,
          experiment: run.variant.experiment,
          repetition: run.repetition,
          variant: run.variant,
          error: {
            message: e.message,
            stack: e.stack,
          },
        });
      } finally {
        // This is not perfectly atomic, but should be fine for this use case.
        await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));
      }
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  await new Promise((resolve) => setTimeout(resolve, 500));

  clearInterval(renderInterval);
  logUpdate.clear();
  console.log(
    `\n=== Terca Run Complete: ${runDir} ===\nSee ${resultsFile} for full results.\n`,
  );

  printResults(results);
}

async function runTest(
  runDir: string,
  config: Config,
  test: TercaTest,
  variant: Record<string, any>,
  runId: number,
  repetition: number,
  runState: RunDisplayState,
  signal?: AbortSignal,
) {
  const testRunDir = await setupTestRunDir(runDir, test, variant, repetition);
  runState.logFile = path.join(testRunDir, "run.log");
  const logStream = createWriteStream(runState.logFile);
  const artifactsDir = path.join(testRunDir, "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  try {
    const workspaceDir = await setupWorkspace(testRunDir, config, test);
    await runBeforeActions(
      workspaceDir,
      config,
      test,
      variant,
      logStream,
      runState,
    );
    await runVariantCommand(workspaceDir, variant, logStream, runState);
    const stats = await runAgent(
      workspaceDir,
      artifactsDir,
      config,
      test,
      variant,
      logStream,
      runState,
      signal,
    );
    const evalResult = await evaluate(workspaceDir, test, logStream, runState);
    return { evalResult, stats };
  } finally {
    logStream.close();
  }
}

async function createRunDir(): Promise<string> {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
  let i = 1;
  let runDir: string;

  const baseDir = path.join(".terca", "runs");
  await fs.mkdir(baseDir, { recursive: true }); // Ensure base directory exists

  while (true) {
    runDir = path.join(baseDir, `${dateStr}-${i.toString().padStart(3, "0")}`);
    try {
      await fs.mkdir(runDir); // Don't use recursive here
      return runDir;
    } catch (e: any) {
      if (e.code === "EEXIST") {
        i++;
        continue;
      }
      throw e;
    }
  }
}

async function setupTestRunDir(
  runDir: string,
  test: TercaTest,
  variant: Record<string, any>,
  repetition: number,
): Promise<string> {
  const repetitionStr = repetition.toString().padStart(2, "0");
  const testRunDir = path.join(
    runDir,
    test.name,
    `${variant.environment}.${variant.experiment}.${repetitionStr}`,
  );

  await fs.mkdir(testRunDir, { recursive: true });

  return testRunDir;
}

async function setupWorkspace(
  testRunDir: string,
  config: Config,
  test: TercaTest,
): Promise<string> {
  const workspaceDir = path.join(testRunDir, "workspace");
  const sourceDir = test.workspaceDir || config.workspaceDir;
  if (!sourceDir) {
    await fs.mkdir(workspaceDir, { recursive: true });
    return workspaceDir;
  }
  await fs.cp(sourceDir, workspaceDir, { recursive: true });
  return workspaceDir;
}

async function runVariantCommand(
  workspaceDir: string,
  variant: Record<string, any>,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const command = variant.command as string | undefined;
  if (!command) {
    return;
  }

  runState.message = `variant: running \`${command}\``;
  logStream.write(`
--- Running variant command: ${command} ---
`);
  const [cmd, ...args] = command.split(" ");
  const proc = spawn(cmd, args, {
    cwd: workspaceDir,
    stdio: "pipe",
  });
  proc.stdout?.pipe(logStream, { end: false });
  proc.stderr?.pipe(logStream, { end: false });
  await new Promise((resolve) => {
    proc.on("close", resolve);
  });
  logStream.write(`
--- End of variant command: ${command} ---
`);
}

async function runAgent(
  workspaceDir: string,
  artifactsDir: string,
  config: Config,
  test: TercaTest,
  variant: Record<string, any>,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
  parentSignal?: AbortSignal,
): Promise<AgentRunnerStats | undefined> {
  const agent = variant.agent as string;
  const Runner = AGENT_RUNNERS[agent];
  if (!Runner) {
    console.log(`Unknown agent: ${agent}, skipping`);
    return;
  }
  const runner = new Runner();
  runState.message = `agent \`${agent}\` running...`;

  const prompt = [
    config.preamble,
    variant.preamble,
    test.prompt,
    variant.postamble,
    config.postamble,
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim();

  const controller = new AbortController();
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", () => {
        controller.abort();
      });
    }
  }

  const timeoutSeconds = test.timeoutSeconds || config.timeoutSeconds || 300;
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutSeconds * 1000);

  // TODO: Create temporary files for rules and mcpServers
  const runnerOpts = {
    workspaceDir,
    artifactsDir,
    prompt,
    rulesFile: variant.rules as string | undefined,
    mcpServers: variant.mcpServers as any,
    signal: controller.signal,
    logger: logStream,
  };

  let stats: AgentRunnerStats | undefined;
  logStream.write(`
--- Running agent: ${agent} ---
`);
  try {
    for await (const progress of runner.run(runnerOpts)) {
      if (progress.output) {
        logStream.write(progress.output);
      }
      if (progress.stats) {
        stats = progress.stats;
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  logStream.write(`
--- End of agent: ${agent} ---
`);
  if (timedOut && stats) {
    stats.timedOut = true;
  }
  return stats;
}

async function evaluate(
  workspaceDir: string,
  test: TercaTest,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const results: any = {};
  const evalCtx: evalActions.EvalActionContext = {
    workspaceDir,
    test,
    logStream,
  };

  for (const [i, evalStep] of (test.eval || []).entries()) {
    runState.message = `evaluating: ${evalStep.name} (${i + 1}/${
      test.eval?.length
    })`;
    if (evalStep.commandSuccess) {
      const result = await evalActions.commandSuccess(
        evalCtx,
        evalStep.commandSuccess,
      );
      results[evalStep.name] = result;
    } else if (evalStep.fileExists) {
      const result = await evalActions.fileExists(evalCtx, evalStep.fileExists);
      results[evalStep.name] = result;
    }
  }
  return results;
}
