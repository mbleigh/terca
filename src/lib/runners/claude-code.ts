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

import {
  AgentRunner,
  AgentRunnerOptions,
  AgentRunnerProgress,
  AgentRunnerStats,
} from "../types.js";

import readline from "readline";
import { spawn } from "child_process";
import path from "path";
import { openSync } from "fs";
import fs from "fs/promises";

export class ClaudeAgentRunner implements AgentRunner {
  async *run(options: AgentRunnerOptions): AsyncIterable<AgentRunnerProgress> {
    const startTime = Date.now();
    const args = [
      "--dangerously-skip-permissions",
      "-p",
      options.prompt,
      "--output-format=stream-json",
      "--verbose",
    ];
    const logger = options.logger || process.stderr;

    try {
      await fs.mkdir(options.artifactsDir, { recursive: true });

      if (options.mcpServers) {
        for (const name in options.mcpServers) {
          const server = options.mcpServers[name] as any;
          const mcpArgs: string[] = ["mcp", "add"];

          let transport = server.transport;
          if (!transport) {
            if (server.url) {
              transport = "http";
            } else if (server.command) {
              transport = "stdio";
            } else {
              logger.write(
                `Skipping MCP server ${name}: missing transport and cannot infer.\n`,
              );
              continue;
            }
          }

          mcpArgs.push("--transport", transport);
          mcpArgs.push(name);

          if (transport === "http" || transport === "sse") {
            if (!server.url) {
              logger.write(
                `Skipping MCP server ${name}: missing url for ${transport} transport.\n`,
              );
              continue;
            }
            mcpArgs.push(server.url);
          }

          if (server.headers) {
            for (const key in server.headers) {
              mcpArgs.push("--header", `${key}: ${server.headers[key]}`);
            }
          }

          if (server.env) {
            for (const key in server.env) {
              mcpArgs.push("--env", `${key}=${server.env[key]}`);
            }
          }

          if (transport === "stdio") {
            if (!server.command) {
              logger.write(
                `Skipping MCP server ${name}: missing command for stdio transport.\n`,
              );
              continue;
            }
            mcpArgs.push("--");
            mcpArgs.push(server.command);
            if (server.args) {
              mcpArgs.push(...server.args);
            }
          }

          const mcpCommand = ["claude", ...mcpArgs].join(" ");
          logger.write(`> ${mcpCommand}\n`);

          const mcpChild = spawn("claude", mcpArgs, {
            cwd: options.workspaceDir,
            stdio: ["pipe", "pipe", "pipe"],
          });
          mcpChild.stdin?.end();

          const mcpStdoutChunks: Buffer[] = [];
          const mcpStderrChunks: Buffer[] = [];
          mcpChild.stdout?.on("data", (chunk) =>
            mcpStdoutChunks.push(chunk as Buffer),
          );
          mcpChild.stderr?.on("data", (chunk) =>
            mcpStderrChunks.push(chunk as Buffer),
          );

          const mcpExitCode = await new Promise<number>((resolve, reject) => {
            mcpChild.on("close", (code) => resolve(code ?? -1));
            mcpChild.on("error", reject);
          });

          const mcpStdout = Buffer.concat(mcpStdoutChunks).toString("utf-8");
          if (mcpStdout) {
            yield { output: mcpStdout };
          }
          const mcpStderr = Buffer.concat(mcpStderrChunks).toString("utf-8");
          if (mcpStderr) {
            yield { output: mcpStderr };
          }

          if (mcpExitCode !== 0) {
            yield {
              output: `Error adding MCP server ${name}. Exit code: ${mcpExitCode}\n`,
            };
          }
        }
      }

      const command = [
        "claude",
        ...args.map((arg) => (arg.includes(" ") ? JSON.stringify(arg) : arg)),
      ].join(" ");
      logger.write(`> ${command}\n`);

      const child = spawn("claude", args, {
        cwd: options.workspaceDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.stdin?.end();

      const stderrChunks: Buffer[] = [];
      child.stderr?.on("data", (chunk) => {
        stderrChunks.push(chunk as Buffer);
      });

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
        "claude-transcript.jsonl",
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
          const json = JSON.parse(line);

          if (json.type === "assistant" && json.message?.content) {
            for (const content of json.message.content) {
              if (content.type === "text" && content.text) {
                yield { output: content.text };
              } else if (content.type === "tool_use") {
                requestCount++;
                yield {
                  output: `\n> ${content.name}(${JSON.stringify(
                    content.input,
                  )})\n`,
                };
              }
            }
          } else if (json.type === "user" && json.message?.content) {
            for (const content of json.message.content) {
              if (content.type === "tool_result") {
                yield {
                  output: `\n< ${content.tool_use_id}:\n${content.content}\n`,
                };
              }
            }
          } else if (json.type === "result") {
            if (json.modelUsage) {
              let totalInputTokens = 0;
              let totalOutputTokens = 0;
              let totalCachedInputTokens = 0;

              for (const modelName in json.modelUsage) {
                const usage = json.modelUsage[modelName];
                totalInputTokens +=
                  (usage.inputTokens || 0) +
                  (usage.cacheReadInputTokens || 0) +
                  (usage.cacheCreationInputTokens || 0);
                totalOutputTokens += usage.outputTokens || 0;
                totalCachedInputTokens += usage.cacheReadInputTokens || 0;
              }

              stats = {
                requests: requestCount,
                inputTokens: totalInputTokens,
                outputTokens: totalOutputTokens,
                cachedInputTokens: totalCachedInputTokens,
                durationSeconds: json.duration_ms / 1000,
              };
            }
            if (json.result) {
              yield { output: `\nFinal result: ${json.result}\n` };
            }
          }
        } catch (e: any) {
          logger.write(`Error parsing JSON: ${e.message}\n`);
        }
      }

      const exitCode = await exitCodePromise;

      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (stderr) {
        yield { output: stderr };
      }

      yield { done: true, exitCode, stats };
    } finally {
      // Clean up any resources if needed.
    }
  }
}
