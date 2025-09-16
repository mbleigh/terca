import {
  TercaEvaluatorActions,
  TercaEvaluatorActionType,
  TercaTest,
} from "./types.js";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export interface EvalActionContext {
  workspaceDir: string;
  test: TercaTest;
  logStream: NodeJS.WritableStream;
}

export interface EvalActionResult {
  score: number;
  message?: string;
}

export type EvalAction<T extends TercaEvaluatorActionType> = (
  ctx: EvalActionContext,
  payload: NonNullable<TercaEvaluatorActions[T]>,
) => Promise<EvalActionResult>;

export const commandSuccess: EvalAction<"commandSuccess"> = async (
  { workspaceDir, logStream },
  payload,
) => {
  if (!payload) {
    return {
      score: 0,
      message: "No command provided.",
    };
  }
  logStream.write(
    `
--- Running evaluation command: ${payload} ---
`,
  );
  const [cmd, ...args] = payload.split(" ");
  const proc = spawn(cmd, args, {
    cwd: workspaceDir,
    stdio: "pipe",
  });

  proc.stdout?.pipe(logStream, { end: false });
  proc.stderr?.pipe(logStream, { end: false });

  const exitCode = await new Promise<number>((resolve) => {
    proc.on("close", resolve);
  });
  const score = exitCode === 0 ? 1.0 : 0.0;
  logStream.write(
    `
--- End of evaluation command: ${payload} (Exit code: ${exitCode}) ---
`,
  );
  return {
    score,
    message: `Command "${payload}" exited with code ${exitCode}.`,
  };
};

export const fileExists: EvalAction<"fileExists"> = async (
  { workspaceDir, logStream },
  payload,
) => {
  const files = Array.isArray(payload) ? payload : [payload];
  let allExist = true;
  let missingFile: string | undefined;
  for (const file of files) {
    try {
      await fs.access(path.join(workspaceDir, file));
    } catch {
      allExist = false;
      missingFile = file;
      break;
    }
  }
  const score = allExist ? 1.0 : 0.0;
  const message = allExist
    ? `All files exist: ${files.join(", ")}`
    : `File not found: ${missingFile || ""}`;

  logStream.write(
    `
--- Evaluation fileExists: ${files.join(", ")} (Result: ${score}) ---
`,
  );

  return {
    score,
    message,
  };
};
