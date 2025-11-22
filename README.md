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

```yaml
# Required. The name of your test suite.
name: my-test-suite
# Optional. A description of your test suite.
description: A description of my test suite.

# Optional. Prefix all test prompts with this content.
preamble: |
  You are a helpful assistant.
# Optional. Postfix all test prompts with this content.
postamble: |
  Always format your output as JSON.

# Optional. The number of times to run each eval. Can be overridden by CLI flags.
repetitions: 1
# Optional. The number of evals to run in parallel. Can be overridden by CLI flags.
concurrency: 4
# Optional. The number of seconds to wait for an eval to complete before timing out.
timeoutSeconds: 300

# Optional. A list of actions to run before all evals.
before:
  - command: npm install
  - copy:
      template.js: src/template.js
  - files:
      config.json: |
        {
          "api_key": "YOUR_API_KEY"
        }

# Optional. A list of environments to run the evals in.
environments:
  - name: default-agent
    agent: gemini-cli
    rules: default_rules.txt
# Optional. A list of experiments to run.
experiments:
  - name: no-extra-context
  - name: with-extra-context
    command: setup_context.sh
    postamble: Always use the provided context to answer questions.

# A list of evals to run. (Can also be defined in separate directories)
evals:
  - name: my-eval
    prompt: "Hello, world!"
```

### Eval Configuration (`eval.terca.yaml`)

Each eval directory can contain an `eval.terca.yaml` file which defines the eval configuration.

```yaml
# Required. The prompt to give to the agent.
prompt: "Hello, world!"
# Optional. The name of the eval. Defaults to the directory name.
name: my-eval
# Optional. A description of the eval.
description: A description of the eval.

# Optional. The number of times to run this eval.
repetitions: 1
# Optional. The number of seconds to wait for this eval to complete before timing out.
timeoutSeconds: 300

# Optional. A list of actions to run before this eval.
before:
  - command: npm install

# Optional. A list of tests to run to verify the agent's work.
tests:
  - name: check_output_file
    fileExists: output.txt
  - name: verify_script_runs
    commandSuccess: node script.js
```

### Test Configuration

The `tests` section allows you to define a list of tests to run after each eval.

```yaml
tests:
  # Check if a file or list of files exists.
  - name: check_output_file
    fileExists: output.txt
  - name: check_multiple_files
    fileExists:
      - output1.txt
      - output2.txt

  # Check if a command runs successfully.
  - name: verify_script_runs
    commandSuccess: node script.js
  
  # Check if a command runs successfully and its output contains a string.
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
