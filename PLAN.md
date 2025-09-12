# Terca Implementation Plan

This plan outlines the development of the Terca CLI. Use the checklists below to track progress through each milestone.

## Milestone 1: Project Setup and Core Interfaces

- [ ] Create directory structure: `src/cli` and `src/lib`.
- [ ] Install core dependencies: `typescript`, `ts-node`, `@types/node`, `yaml`, `chalk`.
- [ ] Install testing dependencies: `vitest`.
- [ ] Create `tsconfig.json`.
- [ ] Create `vitest.config.ts`.
- [ ] Add scripts to `package.json` for `build`, `start`, and `test`.
- [ ] Define all required interfaces from `SPEC.md` in `src/lib/interfaces.ts`.
- [ ] Create a basic CLI entry point at `src/cli/index.ts`.

## Milestone 2: Configuration Loading and Matrix Expansion

- [ ] Create `src/lib/config.ts`.
- [ ] Implement `loadConfig` function to read and parse `terca.yaml`.
- [ ] Implement `expandMatrix` function to generate the Cartesian product of all matrix combinations.
- [ ] Write unit tests for `expandMatrix` in `src/lib/config.test.ts` using `vitest`.
- [ ] Use table-style tests as requested in the spec to cover various matrix scenarios.

## Milestone 3: Gemini Agent Runner

- [ ] Create `src/lib/runners/gemini.ts`.
- [ ] Implement the `AgentRunner` interface for the Gemini CLI.
- [ ] Use `child_process.spawn` to execute the `gemini` command.
- [ ] Implement the `run` method to return an `AsyncIterable<AgentRunnerProgress>`.
- [ ] Ensure the runner correctly streams `stdout` and `stderr`.
- [ ] Ensure the runner reports the final `exitCode`.

## Milestone 4: Core Test Execution Orchestration

- [ ] Create the main orchestrator module in `src/lib/runner.ts`.
- [ ] Implement logic to create a unique run directory: `.terca/runs/YYYY-MM-DD-NNN`.
- [ ] Implement the main loop to iterate through each expanded matrix configuration and each test.
- [ ] Implement workspace setup logic (copying `workspaceDir`).
- [ ] Implement the `before` action: `command`.
- [ ] Integrate the Gemini agent runner.
- [ ] Implement log file creation for each agent run.

## Milestone 5: Evaluation and Results

- [ ] Implement the `evaluate` logic within the orchestrator.
- [ ] Implement the `commandSuccess` evaluator.
- [ ] Create or update `results.json` in the run directory after each evaluation.
- [ ] Ensure results are appended correctly for each test.

## Milestone 6: Polished CLI User Interface

- [ ] Enhance `src/cli/index.ts` to drive the test execution and display.
- [ ] Print status updates for each running test.
- [ ] Display a live-updating window of the last ~10 lines of agent output.
- [ ] After all tests complete, read `results.json` and display a formatted summary table.
- [ ] Use `chalk` to color-code the results table based on scores.

## Milestone 7: Advanced Features & Finalization

- [ ] Implement the `copy` `before` action.
- [ ] Implement the `files` `before` action.
- [ ] Update the Gemini runner to handle `rulesFile` and `mcpServers` by creating temporary config files.
- [ ] Add stubs for other agent runners to demonstrate extensibility.
- [ ] Perform a final code review for error handling and edge cases.