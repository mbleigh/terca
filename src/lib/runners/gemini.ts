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

import { spawn } from "child_process";
import readline from "readline";
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
    const args = [
      "-p",
      options.prompt,
      "--yolo",
      "--output-format",
      "stream-json",
    ];
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
        for (const key in options.mcpServers) {
          const server = options.mcpServers[key] as any;
          const url = server.url;
          if (url) {
            delete server.url;
            server.httpUrl = url;
          }
        }
      }

      settings.telemetry = {
        enabled: true,
        target: "local",
        outfile: path.resolve(options.artifactsDir, "telemetry.log"),
      };

      if (Object.keys(settings).length > 0) {
        await fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
      }

      const command = [
        "gemini",
        ...args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg)),
      ].join(" ");
      logger.write(`> ${command}\n`);

      const child = spawn("gemini", args, {
        cwd: options.workspaceDir,
        stdio: ["pipe", "pipe", "pipe"],
      });

      const stderrChunks: Buffer[] = [];
      child.stderr?.on("data", (chunk) => stderrChunks.push(chunk as Buffer));

      const exitCodePromise = new Promise<number>((resolve, reject) => {
        const onAbort = () => {
          child.kill();
          reject(new Error("Aborted"));
        };
        options.signal?.addEventListener("abort", onAbort);

        child.on("close", (code) => {
          options.signal?.removeEventListener("abort", onAbort);
          resolve(code ?? -1);
        });

        child.on("error", (err) => {
          options.signal?.removeEventListener("abort", onAbort);
          reject(err);
        });
      });

      const transcriptFile = path.join(
        options.artifactsDir,
        "gemini-transcript.jsonl",
      );
      await fs.writeFile(transcriptFile, ""); // Clear the file

      let stats: AgentRunnerStats | undefined;
      let requestCount = 0;

      const lineReader = readline.createInterface({
        input: child.stdout!,
      });

      for await (const line of lineReader) {
        if (line.trim() === "") continue;

        await fs.appendFile(transcriptFile, line + "\n");

        try {
          const event = JSON.parse(line);

          switch (event.type) {
            case "message":
              if (event.role === "assistant" && event.content) {
                yield { output: event.content };
              }
              break;
            case "tool_use":
              requestCount++;
              yield {
                output: `\n> ${event.tool_name}(${JSON.stringify(
                  event.parameters,
                )})\n`,
              };
              break;
            case "tool_result":
              yield {
                output: `\n< ${event.tool_id}:\n${event.output}\n`,
              };
              break;
            case "error":
              yield {
                output: `\nError: ${event.message}\n`,
              };
              break;
            case "result":
              if (event.stats) {
                stats = {
                  requests: requestCount + 1, // +1 for initial prompt
                  inputTokens: event.stats.input_tokens || 0,
                  outputTokens: event.stats.output_tokens || 0,
                  cachedInputTokens: event.stats.cached_tokens || 0,
                  durationSeconds: (event.stats.duration_ms || 0) / 1000,
                };
              }
              break;
          }
        } catch (e: any) {
          logger.write(`Error parsing JSON event: ${e.message}\n`);
        }
      }

      const exitCode = await exitCodePromise;

      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (stderr) {
        yield { output: stderr };
      }

      // Always try to get stats from telemetry as it includes cached tokens
      const telemetryFile = path.join(options.artifactsDir, "telemetry.log");
      const telemetryStats = await parseTelemetryLog(telemetryFile, (msg) =>
        logger.write(msg),
      );

      if (telemetryStats) {
        stats = telemetryStats;
      }

      yield { done: true, exitCode, stats };
    } finally {
      // await fs.rm(geminiDir, { recursive: true, force: true });
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
