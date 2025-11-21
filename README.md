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
2.  Define your tests, environments, and experiments in the `terca.yaml` file.
3.  Run Terca from the command line:

    ```bash
    terca
    ```

## Exploring Results

Each invocation of the `terca` command creates a new folder in `.terca/runs`, with subfolders for each test and environment/experiment/repetition combination. Each run has a `results.json` which aggregates the final results of each test as well as log files, artifacts, and the workspace as it was after the task completed for each run.

```sh
.terca/runs/2025-10-28-001
  results.json # the aggregate results
  {test_name}/
    {environment}.{experiment}.{repetition}/
      artifacts/ # detailed artifacts e.g. telemetry logs
      workspace  # the workspace the agent was running in
      run.log    # a log file of the run's progress
```

## `terca.yaml` Configuration Reference

The `terca.yaml` file is the heart of Terca. It allows you to configure your test suite, define your tests, and specify the different configurations you want to run your tests against.

### Top-Level Configuration

| Key             | Type                | Description                                                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | `string`            | The name of your test suite.                                                                            |
| `description`   | `string`            | (Optional) A description of your test suite.                                                            |
| `workspaceDir`  | `string`            | (Optional) The directory to use as the workspace for all tests.                                         |
| `repetitions`   | `number`            | (Optional) The number of times to run each test. Can be overridden by CLI flags.                                                 |
| `concurrency`   | `number`            | (Optional) The number of tests to run in parallel. Can be overridden by CLI flags.                                                      |
| `timeoutSeconds`| `number`            | (Optional) The number of seconds to wait for a test to complete before timing out.                      |
| `preamble`      | `string`            | (Optional) Prefix all test prompts with this content.                                                           |
| `postamble`     | `string`            | (Optional) Postfix all test prompts with this content.                                                            |
| `before`        | `BeforeAction[]`    | (Optional) A list of actions to run before each test.                                                   |
| `tests`         | `TercaTest[]`       | A list of tests to run.                                                                                 |
| `environments`  | `Environment[]`     | (Optional) A list of environments to run the tests in.                                                  |
| `experiments`   | `Experiment[]`      | (Optional) A list of experiments to run the tests in.                                                   |

### Environments and Experiments

The `environments` and `experiments` sections allow you to define a matrix of configurations to run your tests against. The configurations are combined to create a list of test runs.

An `environment` defines a set of configurations that are related to the environment in which the tests are run, such as the agent, rules, and MCP servers.

An `experiment` defines a set of configurations that are related to the experiment you are running, such as the agent, rules, and command.

**Example:**

```yaml
environments:
  - name: default-agent
    agent: gemini
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

### Tests

The `tests` section defines the individual tests to be run.

| Key             | Type                | Description                                                                                             |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------- |
| `name`          | `string`            | The name of the test.                                                                                   |
| `description`   | `string`            | (Optional) A description of the test.                                                                   |
| `prompt`        | `string`            | The prompt to give to the agent.                                                                        |
| `workspaceDir`  | `string`            | (Optional) The directory to use as the workspace for this test.                                         |
| `repetitions`   | `number`            | (Optional) The number of times to run this test.                                                        |
| `timeoutSeconds`| `number`            | (Optional) The number of seconds to wait for this test to complete before timing out.                   |
| `before`        | `BeforeAction[]`    | (Optional) A list of actions to run before this test.                                                   |
| `eval`          | `TercaEvaluator[]`  | (Optional) A list of evaluators to run after this test.                                                 |

### Evaluators

The `eval` section allows you to define a list of evaluators to run after each test. The following evaluators are available:

- `commandSuccess`: Check if a command runs successfully. The value can be a string with the command to run, or an object with a `command` and an `outputContains` string.
- `fileExists`: Check if a file or list of files exists.

**Example:**

```yaml
eval:
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
