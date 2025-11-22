
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { loadConfig } from "./config.js";
import { setupWorkspace } from "./runner.js";
import { Config, TercaEval } from "./types.js";

describe("Hierarchical Config", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "terca-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should load config from subdirectories", async () => {
    // Setup
    await fs.writeFile(
      path.join(tmpDir, "terca.yaml"),
      "name: root\n"
    );

    const testADir = path.join(tmpDir, "test-a");
    await fs.mkdir(testADir);
    await fs.writeFile(
      path.join(testADir, "eval.terca.yaml"),
      "name: test-a-custom\nprompt: do something\n"
    );

    const testBDir = path.join(tmpDir, "test-b");
    await fs.mkdir(testBDir);
    await fs.writeFile(
      path.join(testBDir, "eval.terca.yaml"),
      "prompt: do something else\n"
    );

    // Execute
    const config = await loadConfig(tmpDir);

    // Verify
    expect(config.name).toBe("root");
    expect(config.evals).toHaveLength(2);

    const testA = config.evals.find((t: TercaEval) => t.name === "test-a-custom");
    expect(testA).toBeDefined();
    expect(testA?.dir).toBe(testADir);
    expect(testA?.prompt).toBe("do something");

    const testB = config.evals.find((t: TercaEval) => t.name === "test-b");
    expect(testB).toBeDefined();
    expect(testB?.dir).toBe(testBDir);
    expect(testB?.prompt).toBe("do something else");
  });

  it("should infer suite name from directory if missing", async () => {
    // Setup
    await fs.writeFile(
      path.join(tmpDir, "terca.yaml"),
      "evals: []\n" // No name
    );

    // Execute
    const config = await loadConfig(tmpDir);

    // Verify
    expect(config.name).toBe(path.basename(tmpDir));
  });

  it("should load tests from eval.terca.yaml", async () => {
    const root = tmpDir;
    await fs.writeFile(
      path.join(root, "terca.yaml"),
      `
name: my-suite
  `,
    );

    const testDir = path.join(root, "test-1");
    await fs.mkdir(testDir);
    await fs.writeFile(
      path.join(testDir, "eval.terca.yaml"),
      `
prompt: "do something"
tests:
- name: check-file
fileExists: "foo.txt"
  `,
    );

    const config = await loadConfig(root);

    expect(config.name).toBe("my-suite");
    expect(config.evals).toHaveLength(1);
    expect(config.evals[0].name).toBe("test-1");
    expect(config.evals[0].dir).toBe(path.join(root, "test-1"));
    expect(config.evals[0].tests).toHaveLength(1);
    expect(config.evals[0].tests![0].name).toBe("check-file");
  });

  it("should infer suite and eval names from directories", async () => {
    const root = path.join(tmpDir, "inferred-suite");
    await fs.mkdir(root);

    // No terca.yaml

    const testDir = path.join(root, "inferred-eval");
    await fs.mkdir(testDir);
    await fs.writeFile(
      path.join(testDir, "eval.terca.yaml"),
      `
prompt: "do something"
tests:
- name: check-file
fileExists: "foo.txt"
  `,
    );

    const config = await loadConfig(root);

    expect(config.name).toBe("inferred-suite");
    expect(config.evals).toHaveLength(1);
    expect(config.evals[0].name).toBe("inferred-eval");
  });
});

describe("setupWorkspace", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "terca-test-workspace-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("should layer _base directories correctly", async () => {
    const root = path.join(tmpDir, "workspace-test");
    await fs.mkdir(root);

    // Project _base
    const projectBase = path.join(root, "_base");
    await fs.mkdir(projectBase);
    await fs.writeFile(path.join(projectBase, "common.txt"), "common");
    await fs.writeFile(path.join(projectBase, "overwrite.txt"), "original");

    // Eval dir
    const evalDir = path.join(root, "my-eval");
    await fs.mkdir(evalDir);

    // Eval _base
    const evalBase = path.join(evalDir, "_base");
    await fs.mkdir(evalBase);
    await fs.writeFile(path.join(evalBase, "overwrite.txt"), "overwritten");
    await fs.writeFile(path.join(evalBase, "specific.txt"), "specific");

    const config: Config = {
      name: "test",
      evals: [],
    };

    const evalItem: TercaEval = {
      name: "my-eval",
      prompt: "foo",
      dir: evalDir,
    };

    const runDir = path.join(root, "runs");
    await fs.mkdir(runDir);

    const workspace = await setupWorkspace(runDir, config, evalItem, root);

    expect(await fs.readFile(path.join(workspace, "common.txt"), "utf-8")).toBe("common");
    expect(await fs.readFile(path.join(workspace, "overwrite.txt"), "utf-8")).toBe("overwritten");
    expect(await fs.readFile(path.join(workspace, "specific.txt"), "utf-8")).toBe("specific");
  });
});

