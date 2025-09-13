# Terca Implementation Plan

This plan outlines the development of the Terca CLI. Use the checklists below to track progress through each milestone.

## Milestone 1: Project Setup and Core Interfaces

- [x] Create directory structure: `src/cli` and `src/lib`.
- [x] Install core dependencies: `typescript`, `tsx`, `@types/node`, `yaml`.
- [x] Install testing dependencies: `vitest`.
- [x] Create `tsconfig.json`.
- [x] Create `vitest.config.ts`.
- [x] Add scripts to `package.json` for `build`, `start`, and `test`.
- [x] Define all required interfaces from `SPEC.md` in `src/lib/types.ts`.
- [x] Create a basic CLI entry point at `src/cli/index.ts`.

## Milestone 2: Configuration Loading and Matrix Expansion

- [x] Create `src/lib/config.ts`.
- [x] Implement `loadConfig` function to read and parse `terca.yaml`.
- [x] Implement `expandMatrix` function to generate the Cartesian product of all matrix combinations.
- [x] Write unit tests for `expandMatrix` in `src/lib/config.test.ts` using `vitest`.
- [x] Use table-style tests as requested in the spec to cover various matrix scenarios.

## Milestone 3: Gemini Agent Runner

- [x] Create `src/lib/runners/gemini.ts`.
- [x] Implement the `AgentRunner` interface for the Gemini CLI.
- [x] Use `child_process.spawn` to execute the `gemini` command.
- [x] Implement the `run` method to return an `AsyncIterable<AgentRunnerProgress>`.
- [x] Ensure the runner correctly streams `stdout` and `stderr`.
- [x] Ensure the runner reports the final `exitCode`.

## Milestone 4: Core Test Execution Orchestration

- [x] Create the main orchestrator module in `src/lib/runner.ts`.
- [x] Implement logic to create a unique run directory: `.terca/runs/YYYY-MM-DD-NNN`.
- [x] Implement the main loop to iterate through each expanded matrix configuration and each test.
- [x] Implement workspace setup logic (copying `workspaceDir`).
- [x] Implement the `before` action: `command`.
- [x] Integrate the Gemini agent runner.
- [x] Implement log file creation for each agent run.

## Milestone 5: Evaluation and Results

- [x] Implement the `evaluate` logic within the orchestrator.
- [x] Implement the `commandSuccess` evaluator.
- [x] Create or update `results.json` in the run directory after each evaluation.
- [x] Ensure results are appended correctly for each test.

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