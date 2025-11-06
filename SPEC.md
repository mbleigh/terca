# Specification

The project evaluates LLM agents on their ability to perform software development tasks.

A test case consists of:
- a workspace (a directory with files)
- a prompt
- an assertion to run against the workspace after the agent has run

A runner is responsible for running an agent in a workspace with a prompt and producing an output.

This project provides a CLI for running test cases and evaluating the results.

## Runners

### Gemini

The Gemini runner executes `gemini -p "<prompt>" --yolo --output-format json` in the workspace directory.

It supports the following `AgentRunnerOptions`:
- `mcpServers`: configured in `.gemini/settings.json`
- `rulesFile`: copied into the workspace and configured in `.gemini/settings.json`

### Claude

The Claude runner executes `claude -p "<prompt>" --output-format json` in the workspace directory.

It supports the following `AgentRunnerOptions`:
- `mcpServers`: configured by calling `claude mcp add` for each server.
- `rulesFile`: not supported.

### Open Code

The Open Code runner is not yet implemented.

### Codex

The Codex runner is not yet implemented.
