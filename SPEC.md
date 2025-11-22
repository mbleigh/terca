# Terca Specification

## Terminology

- **Eval**: A single scenario or prompt to be tested. Corresponds to a directory containing an `eval.terca.yaml` file.
- **Test**: A specific verification criterion within an Eval (e.g., checking if a file exists, or if a command succeeds).
- **Suite**: The collection of all Evals in a project.
- **Environment**: A configuration defining the agent, rules, and MCP servers.
- **Experiment**: A configuration defining variations in the prompt or command.

## Project Structure

Terca supports a hierarchical project structure:

```
project_dir/
  terca.yaml          # Global config (environments, experiments)
  _base/              # Baseline files for all evals
  eval-dir-1/         # Eval directory
    eval.terca.yaml   # Eval-specific config
    _base/            # Eval-specific file overlays
```

### Configuration Loading

1.  **`terca.yaml`**: Loaded from the project root. Defines global settings, environments, and experiments.
2.  **`eval.terca.yaml`**: Loaded from any subdirectory. Defines an Eval.
3.  **Name Inference**: If `name` is missing in `terca.yaml` or `eval.terca.yaml`, it defaults to the directory name.

### Workspace Layering

When running an Eval, a temporary workspace is created:
1.  Files from `project_dir/_base` are copied to the workspace.
2.  Files from `eval-dir/_base` are copied to the workspace, overwriting any existing files.

## Configuration Schema

### `terca.yaml` (Global)

- `name`: String (optional, defaults to dir name)
- `evals`: Array of Eval objects (optional, usually empty if using hierarchical structure)
- `environments`: Array of Environment objects
- `experiments`: Array of Experiment objects
- `repetitions`: Number
- `concurrency`: Number
- `timeoutSeconds`: Number
- `before`: Array of BeforeActions

### `eval.terca.yaml` (Eval)

- `name`: String (optional, defaults to dir name)
- `prompt`: String (required)
- `tests`: Array of Test objects
- `repetitions`: Number
- `timeoutSeconds`: Number
- `before`: Array of BeforeActions

### Test Object

- `name`: String (required)
- `commandSuccess`: String or Object { command, outputContains }
- `fileExists`: String or Array of Strings
