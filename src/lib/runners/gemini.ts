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
    const geminiDir = path.join(options.workspaceDir, ".gemini");
    const settingsFile = path.join(geminiDir, "settings.json");
    const args = ["-p", options.prompt, "--yolo", "--output-format", "json"];
    const logger = options.logger || process.stderr;

    try {
      await fs.mkdir(geminiDir, { recursive: true });
      await fs.mkdir(options.artifactsDir, { recursive: true });

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

      settings.telemetry = {
        enabled: true,
        target: "local",
        outfile: path.resolve(options.artifactsDir, "telemetry.log"),
      };

      if (Object.keys(settings).length > 0) {
        await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      }

      const child = spawn("gemini", args, {
        cwd: options.workspaceDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const onAbort = () => {
        child.kill();
      };
      options.signal?.addEventListener("abort", onAbort);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      child.stdout?.on("data", (chunk) => stdoutChunks.push(chunk as Buffer));
      child.stderr?.on("data", (chunk) => stderrChunks.push(chunk as Buffer));

      const exitCode = await new Promise<number>((resolve) => {
        child.on("close", resolve);
      });
      options.signal?.removeEventListener("abort", onAbort);

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
        let json;
        try {
          json = JSON.parse(stdout);
        } catch (e: any) {
          if (exitCode !== 0) {
            const match = stdout.match(/{[\s\S]*}/);
            if (match) {
              try {
                json = JSON.parse(match[0]);
              } catch (e2) {
                // ignore
              }
            }
          }
          if (!json) {
            yield { output: stdout };
            yield {
              output: `
Error parsing JSON output: ${e.message}
`,
            };
          }
        }

        if (json) {
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
        }
      }

      if (exitCode !== 0 && !stats) {
        const telemetryFile = path.join(options.artifactsDir, "telemetry.log");
        stats = await parseTelemetryLog(telemetryFile, (msg) =>
          logger.write(msg),
        );
      }

      yield { done: true, exitCode, stats };
    } finally {
      await fs.rm(geminiDir, { recursive: true, force: true });
    }
  }
}

async function parseTelemetryLog(
  logPath: string,
  debug: (message: string) => void,
): Promise<AgentRunnerStats | undefined> {
  let content: string;
  try {
    content = await fs.readFile(logPath, "utf-8");
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return undefined;
    }
    throw e;
  }

  const stats: AgentRunnerStats = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    durationSeconds: 0,
  };

  const lines = content.split("\n");
  let firstHrTime: [number, number] | undefined;
  let lastHrTime: [number, number] | undefined;
  let inObject = false;
  let currentObjectLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("{")) {
      inObject = true;
      currentObjectLines = [line];
    } else if (inObject) {
      currentObjectLines.push(line);
    }

    if (line.startsWith("}") && inObject) {
      inObject = false;
      try {
        const obj = JSON.parse(currentObjectLines.join("\n"));
        currentObjectLines = [];

        if (obj.hrTime) {
          if (!firstHrTime) {
            firstHrTime = obj.hrTime;
          }
          lastHrTime = obj.hrTime;
        }

        if (obj.attributes?.["event.name"] === "gemini_cli.api_response") {
          stats.requests++;
        }

        if (obj.attributes) {
          for (const key in obj.attributes) {
            if (key.endsWith("_token_count")) {
              const val = obj.attributes[key];
              if (typeof val === "number") {
                if (key === "input_token_count") {
                  stats.inputTokens += val;
                } else if (key === "output_token_count") {
                  stats.outputTokens += val;
                } else if (key === "cached_content_token_count") {
                  stats.cachedInputTokens += val;
                }
              }
            }
          }
        }
      } catch (e: any) {
        debug(`Error parsing telemetry object: ${e.message}\n`);
      }
    }
  }

  if (firstHrTime && lastHrTime) {
    const start = firstHrTime[0] + firstHrTime[1] / 1e9;
    const end = lastHrTime[0] + lastHrTime[1] / 1e9;
    stats.durationSeconds = end - start;
  }

  if (
    stats.requests > 0 ||
    stats.inputTokens > 0 ||
    stats.outputTokens > 0 ||
    stats.cachedInputTokens > 0
  ) {
    return stats;
  }

  return undefined;
}
