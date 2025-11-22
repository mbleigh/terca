> [!WARNING]
> Terca is pre-alpha software. It is almost certainly broken in all kinds of ways.


# Terca

Terca is a test and evaluation runner for CLI-based coding agents. It allows you to define a suite of tests and run them against different configurations of your agent, helping you gain confidence in its capabilities.

## Installation

```console
npm i -g terca
terca -v
```

You should see a version number printed when `terca -v` is run.

## Getting Started

1.  Create a `terca.yaml` file in your eval project's root directory.
2.  Create test directories with `eval.terca.yaml` files.
3.  Run Terca from the command line:

    ```bash
    terca
    ```

## Project Structure

Terca uses a hierarchical structure to organize tests and configuration.

```
project_dir/
  terca.yaml          # Global config (environments, experiments)
  _base/              # Baseline files for all evals
  001-some-eval/      # Eval directory
    eval.terca.yaml   # Eval-specific config
    _base/            # Eval-specific file overlays
```

### `_base` Directories

The `_base` directories are used to layer files into the test workspace.
1.  **Project Base**: Files in `project_dir/_base` are copied first.
2.  **Eval Base**: Files in `eval_dir/_base` are copied next, overwriting any project-level files.

### `eval.terca.yaml`

Each eval directory can contain an `eval.terca.yaml` file which defines the eval configuration. This file supports the same schema as the `evals` array in `terca.yaml`. If `name` is omitted, it defaults to the directory name.

## Exploring Results

Each invocation of the `terca` command creates a new folder in `.terca/runs`, with subfolders for each eval and environment/experiment/repetition combination. Each run has a `results.json` which aggregates the final results of each eval as well as log files, artifacts, and the workspace as it was after the task completed for each run.

```sh
.terca/runs/2025-10-28-001
  results.json # the aggregate results
  {eval_name}/
    {environment}.{experiment}.{repetition}/
      artifacts/ # detailed artifacts e.g. telemetry logs
      workspace  # the workspace the agent was running in
      run.log    # a log file of the run's progress
```

## Configuration

### Top-Level Configuration (`terca.yaml`)

| Field           | Type                | Description                                                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | `string`            | The name of your test suite.                                                                            |
| `description`   | `string`            | (Optional) A description of your test suite.                                                            |
| `repetitions`   | `number`            | (Optional) The number of times to run each eval. Can be overridden by CLI flags.                                                 |
| `concurrency`   | `number`            | (Optional) The number of evals to run in parallel. Can be overridden by CLI flags.                                                      |
| `timeoutSeconds`| `number`            | (Optional) The number of seconds to wait for an eval to complete before timing out.                      |
| `preamble`      | `string`            | (Optional) Prefix all test prompts with this content.                                                           |
| `postamble`     | `string`            | (Optional) Postfix all test prompts with this content.                                                            |
| `before`        | `BeforeAction[]`    | (Optional) A list of actions to run before all evals.                                                   |
| `evals`         | `Eval[]`            | A list of evals to run.                                                                                 |
| `environments`  | `Environment[]`     | (Optional) A list of environments to run the evals in.                                                  |
| `experiments`   | `Experiment[]`      | (Optional) A list of experiments to run.                                                                |

### Environments and Experiments

The `environments` and `experiments` sections allow you to define a matrix of configurations to run your tests against. The configurations are combined to create a list of test runs.

An `environment` defines a set of configurations that are related to the environment in which the tests are run, such as the agent, rules, and MCP servers.

An `experiment` defines a set of configurations that are related to the experiment you are running, such as the agent, rules, and command.

**Example:**

```yaml
environments:
  - name: default-agent
    agent: gemini-cli
    rules: default_rules.txt
experiments:
  - name: no-extra-context
  - name: with-extra-context
    command: setup_context.sh
    postamble: Always use the provided context to answer questions.
```

### Before Actions

The `before` section allows you to run a list of actions before each test. The following actions are available:

- `copy`: Copy a file or directory. The value is a map of source to destination.
- `files`: Create a file with the given content. The value is a map of filename to content.
- `command`: Run a command.

**Example:**

```yaml
before:
  - command: npm install
  - copy:
      template.js: src/template.js
  - files:
      config.json: |
        {
          "api_key": "YOUR_API_KEY"
        }
```

### Eval Configuration (`Eval`)

| Field           | Type                | Description                                                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | `string`            | The name of the eval.                                                                                   |
| `description`   | `string`            | (Optional) A description of the eval.                                                                   |
| `prompt`        | `string`            | The prompt to give to the agent.                                                                        |
| `repetitions`   | `number`            | (Optional) The number of times to run this eval.                                                        |
| `timeoutSeconds`| `number`            | (Optional) The number of seconds to wait for this eval to complete before timing out.                   |
| `before`        | `BeforeAction[]`    | (Optional) A list of actions to run before this eval.                                                   |
| `tests`         | `Test[]`            | (Optional) A list of tests to run to verify the agent's work.                                           |

### Test Configuration (`Test`)

The `tests` section allows you to define a list of tests to run after each eval. The following tests are available:

| Field           | Type                | Description                                                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | `string`            | The name of the test.                                                                                   |
| `commandSuccess`| `string \| object`  | (Optional) A command to run. If it exits with 0, the test passes. Can also specify `outputContains`.    |
| `fileExists`    | `string \| string[]`| (Optional) A file or list of files that must exist for the test to pass.                                |
The `tests` section allows you to define a list of tests to run after each eval. The following tests are available:

- `commandSuccess`: Check if a command runs successfully. The value can be a string with the command to run, or an object with a `command` and an `outputContains` string.
- `fileExists`: Check if a file or list of files exists.

**Example:**

```yaml
tests:
  - name: check_output_file
    fileExists: output.txt
  - name: verify_script_runs
    commandSuccess: node script.js
  - name: validate_content
    commandSuccess:
      command: grep "Expected output" output.txt
      outputContains: "Expected output"
```

## Command-Line Interface (CLI) Usage

```bash
terca [options]
```

### Options

| Flag                      | Description                               |
| ------------------------- | ----------------------------------------- |
| `-t, --test <test_name>`    | Run only the specified test.              |
| `-x, --experiment <exp_name>` | Run only the specified experiment.        |
| `-n, --repetitions <n>`   | Override the number of repetitions.       |
| `-c, --concurrency <n>`   | Override the concurrency level.           |
| `-v, --version`           | Print the current Terca CLI version.      |
