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
  for (const [dest, content] of Object.entries(payload)) {
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
  logStream: NodeJS.WritableStream,
  runState: RunDisplayState,
) {
  const actions = [...(config.before || []), ...(test.before || [])];
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
