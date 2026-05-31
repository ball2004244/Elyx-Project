/**
 * Tests for the RFC-4180 CSV helpers (src/lib/csv.js).
 * Structured by the 3-3-3 rule: 3 happy, 3 hard, 3 edge.
 * Run: bun test
 */

import { expect, test } from 'bun:test';
import { toCsv, parseCsv } from '../src/lib/csv.js';

/* ---- Happy: simple write/read ------------------------------------------- */

test('happy: toCsv writes header + rows in column order', () => {
  expect(toCsv([{ a: '1', b: '2' }], ['a', 'b'])).toBe('a,b\n1,2\n');
});

test('happy: parseCsv reads simple rows into keyed objects', () => {
  expect(parseCsv('a,b\n1,2\n3,4\n')).toEqual([
    { a: '1', b: '2' },
    { a: '3', b: '4' },
  ]);
});

test('happy: toCsv defaults columns to keys of the first row', () => {
  expect(toCsv([{ x: '1', y: '2' }]).split('\n')[0]).toBe('x,y');
});

/* ---- Hard: quoting, escaping, round-trip -------------------------------- */

test('hard: toCsv quotes fields with comma, quote, or newline', () => {
  const csv = toCsv(
    [{ a: 'x,y', b: 'he said "hi"', c: 'line1\nline2' }],
    ['a', 'b', 'c'],
  );
  expect(csv).toContain('"x,y"');
  expect(csv).toContain('"he said ""hi"""');
  expect(csv).toContain('"line1\nline2"');
});

test('hard: parseCsv handles quoted commas, escaped quotes, newlines', () => {
  const rows = parseCsv('a,b\n"x,y","he ""hi"""\n"l1\nl2",z\n');
  expect(rows[0]).toEqual({ a: 'x,y', b: 'he "hi"' });
  expect(rows[1]).toEqual({ a: 'l1\nl2', b: 'z' });
});

test('hard: toCsv -> parseCsv round-trips tricky values', () => {
  const original = [{ a: 'x,y', b: 'q"q', c: 'l1\nl2' }];
  expect(parseCsv(toCsv(original, ['a', 'b', 'c']))).toEqual(original);
});

/* ---- Edge: empty / null / CRLF / no trailing newline -------------------- */

test('edge: toCsv renders null/undefined as empty fields', () => {
  expect(toCsv([{ a: null, b: undefined, c: 0 }], ['a', 'b', 'c'])).toBe(
    'a,b,c\n,,0\n',
  );
});

test('edge: empty/blank inputs yield empty results', () => {
  expect(toCsv([])).toBe('');
  expect(toCsv(null)).toBe('');
  expect(parseCsv('')).toEqual([]);
  expect(parseCsv('   ')).toEqual([]);
});

test('edge: parseCsv handles CRLF and a missing trailing newline', () => {
  expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([{ a: '1', b: '2' }]);
  expect(parseCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }]);
});
