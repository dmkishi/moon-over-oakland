import { Temporal } from '@js-temporal/polyfill';

/**
 * Split a Horizons raw text response into its CSV header names and data rows.
 */
export function parseCsvBlock(raw: string): { headers: string[]; rows: string[][] } {
  // Locate the CSV data block delimited by `$$SOE` (start of ephemeris) and
  // `$$EOE` (end of ephemeris).
  const soeIndex = raw.indexOf('$$SOE');
  const eoeIndex = raw.indexOf('$$EOE');
  if (soeIndex === -1 || eoeIndex === -1) {
    throw new Error(
      'Could not find $$SOE/$$EOE markers in Horizons output.\n' +
      'Raw response (first 2000 chars):\n' +
      raw.slice(0, 2000),
    );
  }

  // Extract the CSV header: the last comma-bearing line before the data block.
  const preSOE = raw.slice(0, soeIndex);
  const preLines = preSOE.split('\n').filter((line) => line.trim().length > 0);
  let headerLine = '';
  for (let i = preLines.length - 1; i >= 0; i--) {
    if (preLines[i].includes(',')) {
      headerLine = preLines[i];
      break;
    }
  }
  const headers = headerLine.split(',').map((h) => h.trim());

  // Extract the CSV data rows: the lines between `$$SOE` and `$$EOE`.
  const dataBlock = raw.slice(soeIndex + 5, eoeIndex).trim();
  const rows = dataBlock
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => line.split(',').map((c) => c.trim()));

  return { headers, rows };
}

/**
 * Resolve a column by name so we don't rely on fixed column positions.
 */
export function columnIndex(headers: string[], pattern: RegExp): number {
  const index = headers.findIndex((header) => pattern.test(header));
  if (index === -1) {
    throw new Error(
      `Column matching ${pattern} not found. Headers: ${JSON.stringify(headers)}`,
    );
  }
  return index;
}

const HORIZONS_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Convert a Horizons row stamp ("2026-Mar-08 08:00", UT) to the observer's zone.
 */
export function parseHorizonsDatetime(datetime: string, timeZone: string): Temporal.ZonedDateTime {
  const [datePart, timePart] = datetime.split(' ');
  const monthIndex = HORIZONS_MONTHS.indexOf(datePart.slice(5, 8));
  if (monthIndex === -1) {
    throw new Error(`Unrecognized month in Horizons datetime: ${datetime}`);
  }
  const month = String(monthIndex + 1).padStart(2, '0');
  return Temporal.PlainDateTime
    .from(`${datePart.slice(0, 4)}-${month}-${datePart.slice(9)}T${timePart}`)
    .toZonedDateTime('UTC')
    .withTimeZone(timeZone);
}
