import { describe, it, expect } from 'vitest';
import { expandMatrix } from './config';
import { MatrixEntry } from './types';

describe('expandMatrix', () => {
  it('should return an array with an empty object for an empty matrix', () => {
    const matrix: MatrixEntry[] = [];
    expect(expandMatrix(matrix)).toEqual([{}]);
  });

  it('should handle a single entry with a single value', () => {
    const matrix: MatrixEntry[] = [{ agent: 'gemini' }];
    expect(expandMatrix(matrix)).toEqual([{ agent: 'gemini' }]);
  });

  it('should handle a single entry with an array of values', () => {
    const matrix: MatrixEntry[] = [{ agent: ['gemini', 'claude'] }];
    const expected = [{ agent: 'gemini' }, { agent: 'claude' }];
    expect(expandMatrix(matrix)).toEqual(expect.arrayContaining(expected));
  });

  it('should handle two entries with single values', () => {
    const matrix: MatrixEntry[] = [{ agent: 'gemini' }, { rulesFile: 'a.txt' }];
    const expected = [{ agent: 'gemini', rulesFile: 'a.txt' }];
    expect(expandMatrix(matrix)).toEqual(expected);
  });

  it('should handle two entries, one with an array', () => {
    const matrix: MatrixEntry[] = [
      { agent: ['gemini', 'claude'] },
      { rulesFile: 'a.txt' },
    ];
    const expected = [
      { agent: 'gemini', rulesFile: 'a.txt' },
      { agent: 'claude', rulesFile: 'a.txt' },
    ];
    expect(expandMatrix(matrix)).toEqual(expect.arrayContaining(expected));
  });

  it('should handle two entries, both with arrays', () => {
    const matrix: MatrixEntry[] = [
      { agent: ['gemini', 'claude'] },
      { rulesFile: ['a.txt', 'b.txt'] },
    ];
    const expected = [
      { agent: 'gemini', rulesFile: 'a.txt' },
      { agent: 'gemini', rulesFile: 'b.txt' },
      { agent: 'claude', rulesFile: 'a.txt' },
      { agent: 'claude', rulesFile: 'b.txt' },
    ];
    expect(expandMatrix(matrix).length).toBe(4);
    expect(expandMatrix(matrix)).toEqual(expect.arrayContaining(expected));
  });

  it('should handle a single entry with multiple array-valued keys', () => {
    const matrix: MatrixEntry[] = [
      {
        agent: ['gemini', 'claude'],
        rulesFile: ['a.txt', 'b.txt'],
      },
    ];
    const expected = [
      { agent: 'gemini', rulesFile: 'a.txt' },
      { agent: 'gemini', rulesFile: 'b.txt' },
      { agent: 'claude', rulesFile: 'a.txt' },
      { agent: 'claude', rulesFile: 'b.txt' },
    ];
    expect(expandMatrix(matrix).length).toBe(4);
    expect(expandMatrix(matrix)).toEqual(expect.arrayContaining(expected));
  });
});