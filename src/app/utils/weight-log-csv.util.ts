import { WeightEntry, WeightEntryDB, WeightUnit } from '../services/database.service';
import { toDateKey, toLocalMidnightString } from './date-converter.util';
import { unitToKg } from './unit-conversion.util';

const HEADER = ['date', 'weight', 'unit', 'notes'];
const WEIGHT_UNITS: readonly WeightUnit[] = ['kg', 'lbs', 'st'];

export interface WeightLogCsvParseResult {
  rows: Omit<WeightEntryDB, 'id'>[];
  invalidRows: number;
}

/** Exports weights in the display unit. `date` is already midnight-normalized, so it is written as-is. */
export function weightLogsToCsv(entries: WeightEntry[], unit: WeightUnit): string {
  const decimals = unit === 'st' ? 4 : 2;
  const lines = [HEADER.join(',')];
  for (const entry of entries) {
    const weight = Number(entry.weight.toFixed(decimals));
    lines.push([toLocalMidnightString(entry.date), weight, unit, escapeCsvField(entry.notes ?? '')].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Parses weight log CSV text. Weights are converted to kg for storage.
 * Rows with an invalid date, weight or unit are counted in `invalidRows` and skipped.
 * A missing `unit` column or cell falls back to `defaultUnit`.
 */
export function parseWeightLogsCsv(text: string, defaultUnit: WeightUnit): WeightLogCsvParseResult {
  const [header, ...body] = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  if (!header) throw new Error('The file is empty.');

  const columns = header.map(h => h.trim().toLowerCase());
  const dateCol = columns.indexOf('date');
  const weightCol = columns.indexOf('weight');
  const unitCol = columns.indexOf('unit');
  const notesCol = columns.indexOf('notes');
  if (dateCol < 0 || weightCol < 0) throw new Error('The CSV must have "date" and "weight" columns.');

  const rows: Omit<WeightEntryDB, 'id'>[] = [];
  let invalidRows = 0;

  for (const record of body) {
    const dateValue = (record[dateCol] ?? '').trim();
    const weight = Number((record[weightCol] ?? '').trim());
    const unitValue = unitCol >= 0 ? (record[unitCol] ?? '').trim().toLowerCase() : '';
    const unit = unitValue || defaultUnit;

    if (!isValidDateValue(dateValue) || !Number.isFinite(weight) || weight <= 0 || !isWeightUnit(unit)) {
      invalidRows++;
      continue;
    }

    const notes = notesCol >= 0 ? (record[notesCol] ?? '').trim() : '';
    rows.push({
      weight_kg: unitToKg(weight, unit),
      logged_at: toLocalMidnightString(dateValue),
      notes: notes || undefined,
    });
  }

  return { rows, invalidRows };
}

function escapeCsvField(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value) || value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

function isWeightUnit(value: string): value is WeightUnit {
  return (WEIGHT_UNITS as readonly string[]).includes(value);
}

// Accepts "YYYY-MM-DD" and the stored "YYYY-MM-DDTHH:mm:ss" form; the time part is discarded.
function isValidDateValue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/.test(value)) return false;
  const key = toDateKey(value);
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

// RFC 4180 parser: quoted fields may contain commas, doubled quotes and line breaks.
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') {
        field += ch;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records.filter(r => r.some(cell => cell.trim() !== ''));
}
