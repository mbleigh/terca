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
import fs from "fs/promises";
import path from "path";
import {
  Config,
  RunDisplayState,
  TercaBeforeAction,
  TercaTest,
} from "./types.js";

interface BeforeActionContext {
  workspaceDir: string;
  logStream: NodeJS.WritableStream;
  runState: RunDisplayState;
}

async function command(ctx: BeforeActionContext, payload: string) {
  ctx.runState.message = `before: running
${payload}
`;
  ctx.logStream.write(`
--- Running before command: ${payload} ---
`);
  const [cmd, ...args] = payload.split(" ");
  const proc = spawn(cmd, args, {
    cwd: ctx.workspaceDir,
    stdio: "pipe",
  });
  proc.stdout?.pipe(ctx.logStream, { end: false });
  proc.stderr?.pipe(ctx.logStream, { end: false });
  await new Promise((resolve) => {
    proc.on("close", resolve);
  });
  ctx.logStream.write(`
--- End of before command: ${payload} ---
`);
}

async function copy(ctx: BeforeActionContext, payload: Record<string, string>) {
  ctx.runState.message = `before: copying files`;
  for (const [src, dest] of Object.entries(payload)) {
    await fs.cp(src as string, path.join(ctx.workspaceDir, dest as string), {
      recursive: true,
    });
  }
}

async function files(
  ctx: BeforeActionContext,
  payload: Record<string, string>,
) {
  ctx.runState.message = `before: writing files`;
  ctx.logStream.write(`\n--- Before: writing files: ${Object.keys(payload).join(", ")} ---\n`);
  for (const [dest, content] of Object.entries(payload)) {
    await fs.mkdir(path.dirname(path.join(ctx.workspaceDir, dest as string)), { recursive: true });
    await fs.writeFile(
      path.join(ctx.workspaceDir, dest as string),
      content as string,
    );
  }
}

const HANDLERS: Record<
  string,
  (ctx: BeforeActionContext, payload: any) => Promise<void>
> = {
  command,
  copy,
  files,
};

export async function runBeforeActions(
  workspaceDir: string,
  config: Config,
  test: TercaTest,
  variant: Record<string, any>,
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const actions = [
    ...(config.before || []),
    ...(variant.before || []),
    ...(test.before || []),
  ];
  const ctx: BeforeActionContext = { workspaceDir, logStream, runState };

  for (const action of actions) {
    const actionName = Object.keys(action)[0] as keyof TercaBeforeAction;
    const payload = action[actionName];
    const handler = HANDLERS[actionName];
    if (handler) {
      await handler(ctx, payload);
    }
  }
}
