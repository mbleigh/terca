/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from "vitest";
import { expandEnvironmentsAndExperiments } from "./config.js";
import { Config } from "./types.js";

describe("expandEnvironmentsAndExperiments", () => {
  const testCases = [
    {
      desc: "should handle no environments or experiments",
      input: {
        name: "test",
        tests: [],
      },
      expect: [
        { name: "default", environment: "default", experiment: "default" },
      ],
    },
    {
      desc: "should handle environments only",
      input: {
        name: "test",
        tests: [],
        environments: [{ name: "gemini" }, { name: "claude" }],
      },
      expect: [
        { name: "gemini", environment: "gemini", experiment: "default" },
        { name: "claude", environment: "claude", experiment: "default" },
      ],
    },
    {
      desc: "should handle experiments only",
      input: {
        name: "test",
        tests: [],
        experiments: [{ name: "control" }, { name: "test" }],
      },
      expect: [
        { name: "control", environment: "default", experiment: "control" },
        { name: "test", environment: "default", experiment: "test" },
      ],
    },
    {
      desc: "should create a cartesian product of environments and experiments",
      input: {
        name: "test",
        tests: [],
        environments: [{ name: "gemini" }, { name: "claude" }],
        experiments: [{ name: "control" }, { name: "test" }],
      },
      expect: [
        { name: "control", environment: "gemini", experiment: "control" },
        { name: "test", environment: "gemini", experiment: "test" },
        { name: "control", environment: "claude", experiment: "control" },
        { name: "test", environment: "claude", experiment: "test" },
      ],
    },
    {
      desc: "should merge properties, with experiment overriding environment",
      input: {
        name: "test",
        tests: [],
        environments: [{ name: "gemini", agent: "gemini" }],
        experiments: [
          { name: "control", command: "cmd1" },
          { name: "test", agent: "claude", command: "cmd2" },
        ],
      },
      expect: [
        {
          name: "control",
          agent: "gemini",
          command: "cmd1",
          environment: "gemini",
          experiment: "control",
        },
        {
          name: "test",
          agent: "claude",
          command: "cmd2",
          environment: "gemini",
          experiment: "test",
        },
      ],
    },
  ];

  for (const { desc, input, expect: expected } of testCases) {
    it(desc, () => {
      const result = expandEnvironmentsAndExperiments(input as Config);
      expect(result.length).toBe(expected.length);
      expect(result).toEqual(expect.arrayContaining(expected));
    });
  }
});
