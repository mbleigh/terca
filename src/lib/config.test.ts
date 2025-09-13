import { describe, it, expect } from 'vitest';
import { expandMatrix } from './config.js';
import { MatrixEntry } from './types.js';

describe('expandMatrix', () => {
  const testCases = [
    {
      desc: 'should return an array with an empty object for an empty matrix',
      input: [],
      expect: [{}],
    },
    {
      desc: 'should handle a single entry with a single value',
      input: [{ agent: 'gemini' }],
      expect: [{ agent: 'gemini' }],
    },
    {
      desc: 'should handle a single entry with an array of values',
      input: [{ agent: ['gemini', 'claude'] }],
      expect: [{ agent: 'gemini' }, { agent: 'claude' }],
    },
    {
      desc: 'should handle two entries with single values',
      input: [{ agent: 'gemini' }, { rulesFile: 'a.txt' }],
      expect: [{ agent: 'gemini', rulesFile: 'a.txt' }],
    },
    {
      desc: 'should handle two entries, one with an array',
      input: [{ agent: ['gemini', 'claude'] }, { rulesFile: 'a.txt' }],
      expect: [
        { agent: 'gemini', rulesFile: 'a.txt' },
        { agent: 'claude', rulesFile: 'a.txt' },
      ],
    },
    {
      desc: 'should handle two entries, both with arrays',
      input: [{ agent: ['gemini', 'claude'] }, { rulesFile: ['a.txt', 'b.txt'] }],
      expect: [
        { agent: 'gemini', rulesFile: 'a.txt' },
        { agent: 'gemini', rulesFile: 'b.txt' },
        { agent: 'claude', rulesFile: 'a.txt' },
        { agent: 'claude', rulesFile: 'b.txt' },
      ],
    },
    {
      desc: 'should handle a single entry with multiple array-valued keys',
      input: [
        {
          agent: ['gemini', 'claude'],
          rulesFile: ['a.txt', 'b.txt'],
        },
      ],
      expect: [
        { agent: 'gemini', rulesFile: 'a.txt' },
        { agent: 'gemini', rulesFile: 'b.txt' },
        { agent: 'claude', rulesFile: 'a.txt' },
        { agent: 'claude', rulesFile: 'b.txt' },
      ],
    },
    {
      desc: 'should handle multiple entries with multiple array-valued keys',
      input: [
        { agent: ['gemini', 'claude'] },
        {
          rulesFile: ['a.txt', 'b.txt'],
          mcpServers: [null, { test: { command: 'test-server' } }],
        },
      ],
      expect: [
        { agent: 'gemini', rulesFile: 'a.txt', mcpServers: null },
        {
          agent: 'gemini',
          rulesFile: 'a.txt',
          mcpServers: { test: { command: 'test-server' } },
        },
        { agent: 'gemini', rulesFile: 'b.txt', mcpServers: null },
        {
          agent: 'gemini',
          rulesFile: 'b.txt',
          mcpServers: { test: { command: 'test-server' } },
        },
        { agent: 'claude', rulesFile: 'a.txt', mcpServers: null },
        {
          agent: 'claude',
          rulesFile: 'a.txt',
          mcpServers: { test: { command: 'test-server' } },
        },
        { agent: 'claude', rulesFile: 'b.txt', mcpServers: null },
        {
          agent: 'claude',
          rulesFile: 'b.txt',
          mcpServers: { test: { command: 'test-server' } },
        },
      ],
    },
  ];

  for (const { desc, input, expect: expected } of testCases) {
    it(desc, () => {
      const result = expandMatrix(input as MatrixEntry[]);
      expect(result.length).toBe(expected.length);
      expect(result).toEqual(expect.arrayContaining(expected));
    });
  }
});