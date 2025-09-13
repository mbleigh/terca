import { expandMatrix, loadConfig } from "./config.js";
import { GeminiAgentRunner } from "./runners/gemini.js";
import { ClaudeAgentRunner } from "./runners/claude.js";
import { CodexAgentRunner } from "./runners/codex.js";
import { OpencodeAgentRunner } from "./runners/opencode.js";
import { AgentRunner, Config, ExpandedMatrix, TercaTest } from "./types.js";
import path from "path";
import fs from "fs/promises";
import { createWriteStream } from "fs";
import { spawn } from "child_process";
import {
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
  printHeader,
  printAgentOutput,
  printResults,
} from "./ui.js";

const AGENT_RUNNERS: Record<string, new () => AgentRunner> = {
  gemini: GeminiAgentRunner,
  claude: ClaudeAgentRunner,
  codex: CodexAgentRunner,
  opencode: OpencodeAgentRunner,
};

export async function runTests() {
  const config = await loadConfig();
  const matrix = expandMatrix(config.matrix);
  const runDir = await createRunDir();

  printHeader(`Terca Run: ${runDir}`);

  const results: any = {};

  for (const test of config.tests) {
    for (const m of matrix) {
      const matrixId = Object.entries(m)
        .map(([k, v]) => {
          if (typeof v === "object" && v !== null) {
            return `${k}=${JSON.stringify(v)}`;
          }
          return `${k}=${v}`;
        })
        .join(",");
      const spinner = startSpinner(`Running test: ${test.name} (${matrixId})`);
      try {
        const result = await runTest(runDir, config, test, m);
        if (!results[test.name]) {
          results[test.name] = {};
        }
        results[test.name][matrixId] = result;
        succeedSpinner(spinner, `Test finished: ${test.name} (${matrixId})`);
      } catch (e: any) {
        failSpinner(spinner, `Test failed: ${test.name} (${matrixId})`);
        console.error(e);
      }
    }
  }

  const resultsFile = path.join(runDir, "results.json");
  await fs.writeFile(resultsFile, JSON.stringify(results, null, 2));

  printResults(results);
}

async function runTest(
  runDir: string,
  config: Config,
  test: TercaTest,
  matrix: ExpandedMatrix,
) {
  const testRunDir = await setupTestRunDir(runDir, test, matrix);
  await setupWorkspace(testRunDir, config);
  await runBeforeActions(testRunDir, config, test);
  await runAgent(testRunDir, test, matrix);
  return await evaluate(testRunDir, test);
}

async function createRunDir(): Promise<string> {
  const date = new Date();
  const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
  let i = 1;
  let runDir: string;
  while (true) {
    runDir = path.join(
      ".terca",
      "runs",
      `${dateStr}-${i.toString().padStart(3, "0")}`,
    );
    try {
      await fs.mkdir(runDir, { recursive: true });
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
  matrix: ExpandedMatrix,
): Promise<string> {
  const matrixId = Object.entries(matrix)
    .map(([k, v]) => {
      if (typeof v === "object" && v !== null) {
        return `${k}=${JSON.stringify(v)}`;
      }
      return `${k}=${v}`;
    })
    .join(",");
  const testRunDir = path.join(runDir, test.name, matrixId);
  await fs.mkdir(testRunDir, { recursive: true });
  return testRunDir;
}

async function setupWorkspace(testRunDir: string, config: Config) {
  if (!config.workspaceDir) {
    return;
  }
  const workspacePath = path.join(testRunDir, "workspace");
  await fs.cp(config.workspaceDir, workspacePath, { recursive: true });
}

async function runBeforeActions(
  testRunDir: string,
  config: Config,
  test: TercaTest,
) {
  const actions = [...(config.before || []), ...(test.before || [])];
  for (const action of actions) {
    if ("command" in action) {
      const [cmd, ...args] = action.command.split(" ");
      const proc = spawn(cmd, args, {
        cwd: path.join(testRunDir, "workspace"),
        stdio: "inherit",
      });
      await new Promise((resolve) => {
        proc.on("close", resolve);
      });
    } else if ("copy" in action) {
      for (const [src, dest] of Object.entries(action.copy)) {
        await fs.cp(src, path.join(testRunDir, "workspace", dest), {
          recursive: true,
        });
      }
    } else if ("files" in action) {
      for (const [dest, content] of Object.entries(action.files)) {
        await fs.writeFile(path.join(testRunDir, "workspace", dest), content);
      }
    }
  }
}

async function runAgent(
  testRunDir: string,
  test: TercaTest,
  matrix: ExpandedMatrix,
) {
  const agent = matrix.agent as string;
  const Runner = AGENT_RUNNERS[agent];
  if (!Runner) {
    console.log(`Unknown agent: ${agent}, skipping`);
    return;
  }
  const runner = new Runner();
  const logFile = path.join(testRunDir, "agent.log");
  const stream = createWriteStream(logFile);

  // TODO: Create temporary files for rules and mcpServers
  const runnerOpts = {
    workspaceDir: path.join(testRunDir, "workspace"),
    prompt: test.prompt,
    rulesFile: matrix.rules as string | undefined,
    mcpServers: matrix.mcpServers as any,
  };

  for await (const progress of runner.run(runnerOpts)) {
    if (progress.output) {
      stream.write(progress.output);
      printAgentOutput(progress.output);
    }
  }
  stream.close();
}

async function evaluate(testRunDir: string, test: TercaTest) {
  const results: any = {};
  for (const evalStep of test.evaluate || []) {
    if (evalStep.commandSuccess) {
      const [cmd, ...args] = evalStep.commandSuccess.split(" ");
      const proc = spawn(cmd, args, {
        cwd: path.join(testRunDir, "workspace"),
      });
      const exitCode = await new Promise((resolve) => {
        proc.on("close", resolve);
      });
      results[evalStep.name] = exitCode === 0 ? 1.0 : 0.0;
    }
  }
  return results;
}
