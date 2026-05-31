/**
 * @file Minimal, dependency-free RFC-4180 CSV reader/writer.
 *
 * Used to persist/load the static sample data (Decision D4). Kept generic:
 * field <-> object mapping for domain types lives in the data layer, not here.
 */

/**
 * Serialize a single field, quoting only when required (contains comma, quote,
 * CR or LF) and escaping embedded quotes by doubling them.
 * @param {unknown} value
 * @returns {string}
 */
function encodeField(value) {
  const s = value == null ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert an array of row objects to a CSV string.
 * @param {Record<string, unknown>[]} rows
 * @param {string[]} [columns] Explicit column order; defaults to keys of row 0.
 * @returns {string}
 */
export function toCsv(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(encodeField).join(',');
  const body = rows
    .map((row) => cols.map((c) => encodeField(row[c])).join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

/**
 * Parse a CSV string into an array of row objects keyed by the header row.
 * Handles quoted fields, embedded commas/newlines, and doubled quotes.
 * @param {string} text
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];

  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let field = [];
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field.join(''));
    field = [];
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field.push('"');
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field.push(ch);
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // swallow; handle \r\n and lone \r as row breaks
      if (text[i + 1] === '\n') i++;
      pushRow();
    } else {
      field.push(ch);
    }
  }
  // Flush trailing field/row if the file did not end with a newline.
  if (field.length > 0 || row.length > 0) pushRow();

  const [header, ...dataRows] = records;
  if (!header) return [];
  return dataRows
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map((r) => {
      /** @type {Record<string, string>} */
      const obj = {};
      header.forEach((key, idx) => {
        obj[key] = r[idx] ?? '';
      });
      return obj;
    });
}
