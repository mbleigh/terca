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

  const command = typeof payload === "string" ? payload : payload.command;
  const outputContains =
    typeof payload === "string" ? undefined : payload.outputContains;

  logStream.write(
    `
--- Running evaluation command: ${command} ---
`,
  );
  const proc = spawn(command, {
    cwd: workspaceDir,
    stdio: "pipe",
    shell: true,
  });

  let stdout = "";
  let stderr = "";
  proc.stdout?.on("data", (data) => {
    stdout += data.toString();
  });
  proc.stderr?.on("data", (data) => {
    stdout += data.toString();
  });

  proc.stdout?.pipe(logStream, { end: false });
  proc.stderr?.pipe(logStream, { end: false });

  const exitCode = await new Promise<number>((resolve) => {
    proc.on("close", resolve);
  });

  logStream.write(
    `
--- End of evaluation command: ${command} (Exit code: ${exitCode}) ---
`,
  );

  const cmdOutput = `\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;

  if (exitCode > 0) {
    return {
      score: 0.0,
      message: `Command '${command}' exited with code ${exitCode}.${cmdOutput}`,
    };
  }

  if (!outputContains) {
    return {
      score: 1.0,
      message: `Command '${command}' was successful.${cmdOutput}`,
    };
  }

  if (stdout.includes(outputContains)) {
    return {
      score: 1.0,
      message: `Command '${command}' contained output ${JSON.stringify(outputContains)}.${cmdOutput}`,
    };
  } else {
    return {
      score: 0.0,
      message: `Command '${command}' output did not contain ${JSON.stringify(outputContains)}.${cmdOutput}`,
    };
  }
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
