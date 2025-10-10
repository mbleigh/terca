import { spawn } from "child_process";
import {
  AgentRunner,
  AgentRunnerOptions,
  AgentRunnerProgress,
  AgentRunnerStats,
} from "../types.js";
import fs from "fs/promises";
import path from "path";

export class GeminiAgentRunner implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress> {
    const startTime = Date.now();
    const geminiDir = path.join(options.artifactsDir, ".gemini");
    const settingsFile = path.join(geminiDir, "settings.json");
    const args = ["-p", options.prompt, "--yolo", "--output-format", "json"];

    try {
      await fs.mkdir(geminiDir, { recursive: true });

      let settings: any = {};
      try {
        settings = JSON.parse(await fs.readFile(settingsFile, "utf-8"));
      } catch (e: any) {
        if (e.code !== "ENOENT") {
          throw e;
        }
      }

      if (options.rulesFile) {
        const rulesBasename = path.basename(options.rulesFile);
        const rulesDest = path.join(options.workspaceDir, rulesBasename);
        await fs.copyFile(options.rulesFile, rulesDest);

        settings.context ??= {};
        if (!settings.context.fileName) {
          settings.context.fileName = rulesBasename;
        } else {
          const filenames = Array.isArray(settings.context.fileName)
            ? settings.context.fileName
            : [settings.context.fileName];
          if (!filenames.includes(rulesBasename)) {
            filenames.push(rulesBasename);
          }
          settings.context.fileName = filenames;
        }
      }

      if (options.mcpServers) {
        settings.mcpServers = {
          ...(settings.mcpServers || {}),
          ...options.mcpServers,
        };
      }

      if (Object.keys(settings).length > 0) {
        await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      }

      const child = spawn("gemini", args, {
        cwd: options.workspaceDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on("data", (chunk) => stdoutChunks.push(chunk as Buffer));
      child.stderr?.on("data", (chunk) => stderrChunks.push(chunk as Buffer));

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", resolve);
      });

      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (stderr) {
        yield { output: stderr };
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      let stats: AgentRunnerStats | undefined;

      if (stdout) {
        const outputFile = path.join(
          options.artifactsDir,
          "gemini-output.json",
        );
        await fs.writeFile(outputFile, stdout);
        try {
          const json = JSON.parse(stdout);

          if (json.response) {
            yield { output: json.response };
          }

          if (json.stats && json.stats.models) {
            let totalRequests = 0;
            let totalInputTokens = 0;
            let totalCachedInputTokens = 0;
            let totalOutputTokens = 0;

            for (const modelName in json.stats.models) {
              const modelMetrics = json.stats.models[modelName];
              if (modelMetrics.api) {
                totalRequests += modelMetrics.api.totalRequests || 0;
              }
              if (modelMetrics.tokens) {
                totalInputTokens += modelMetrics.tokens.prompt || 0;
                totalCachedInputTokens += modelMetrics.tokens.cached || 0;
                totalOutputTokens += modelMetrics.tokens.candidates || 0;
              }
            }

            stats = {
              requests: totalRequests,
              inputTokens: totalInputTokens,
              cachedInputTokens: totalCachedInputTokens,
              outputTokens: totalOutputTokens,
              durationSeconds: (Date.now() - startTime) / 1000,
            };
          }

          if (json.error) {
            yield {
              output: `
Error: ${json.error.message}
`,
            };
          }
        } catch (e: any) {
          // If stdout was not JSON, yield it as raw output.
          yield { output: stdout };
          yield {
            output: `
Error parsing JSON output: ${e.message}
`,
          };
        }
      }

      yield { done: true, exitCode, stats };
    } finally {
      await fs.rm(geminiDir, { recursive: true, force: true });
    }
  }
}
