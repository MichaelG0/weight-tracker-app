import { WeightEntry, WeightEntryDB, WeightUnit } from '../services/database.service';
import { toLocalMidnightString } from './date-converter.util';
import { unitToKg } from './unit-conversion.util';

const HEADER = ['date', 'weight', 'unit', 'notes'];

const MIN_PLAUSIBLE_KG = 20;
const MAX_PLAUSIBLE_KG = 700;

const DATE_ALIASES = ['date', 'datetime', 'date time', 'timestamp', 'time', 'day', 'logged_at', 'logged at', 'measured at'];
const WEIGHT_ALIASES = ['weight', 'body weight', 'bodyweight', 'weight_kg', 'weight kg', 'value', 'mass', ''];
const NOTES_ALIASES = ['notes', 'note', 'comment', 'comments', 'memo', 'description'];
const UNIT_ALIASES: Record<string, WeightUnit> = {
  kg: 'kg', kgs: 'kg', kilogram: 'kg', kilograms: 'kg',
  lb: 'lbs', lbs: 'lbs', pound: 'lbs', pounds: 'lbs',
  st: 'st', stone: 'st', stones: 'st',
};

export interface WeightLogCsvParseResult {
  rows: Omit<WeightEntryDB, 'id'>[];
  invalidRows: number;
  /** True when day/month order could not be inferred from the file and `dateOrder` was assumed. */
  assumedDateOrder: boolean;
}

export type DateOrder = 'dmy' | 'mdy';

/** Decodes file bytes: honours UTF-8/UTF-16 BOMs and falls back to Windows-1252 when not valid UTF-8. */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Exports weights in the display unit. `date` is already midnight-normalized, so it is written as-is. */
export function weightLogsToCsv(entries: WeightEntry[], unit: WeightUnit): string {
  const decimals = unit === 'st' ? 4 : 2;
  const lines = [HEADER.join(',')];
  for (const entry of entries) {
    const weight = Number(entry.weight.toFixed(decimals));
    lines.push([toLocalMidnightString(entry.date), weight, unit, escapeCsvField(sanitizeNotes(entry.notes ?? ''))].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/**
 * Parses weight log CSV text. Weights are converted to kg for storage.
 * Rows with an invalid date, weight or unit are counted in `invalidRows` and skipped.
 * A missing `unit` column or cell falls back to the unit in the weight header (e.g. "Weight (lbs)"), then `defaultUnit`.
 * Supports `,` `;` tab and `|` delimiters, common header aliases, decimal commas and
 * ISO / DD/MM/YYYY / MM/DD/YYYY dates (day/month order inferred from the file, else `dateOrder`).
 */
export function parseWeightLogsCsv(
  text: string,
  defaultUnit: WeightUnit,
  dateOrder: DateOrder = 'dmy',
): WeightLogCsvParseResult {
  const clean = text.replace(/^\uFEFF/, '');
  const [header, ...body] = parseCsvRecords(clean, detectDelimiter(clean));
  if (!header) throw new Error('The file is empty.');

  const columns = header.map(parseHeader);
  const dateCol = columns.findIndex(c => DATE_ALIASES.includes(c.name));
  const weightCol = columns.findIndex(c => WEIGHT_ALIASES.includes(c.name) && (c.name !== '' || c.unit));
  const unitCol = columns.findIndex(c => c.name === 'unit' || c.name === 'units');
  const notesCol = columns.findIndex(c => NOTES_ALIASES.includes(c.name));
  if (dateCol < 0 || weightCol < 0) throw new Error('The CSV must have "date" and "weight" columns.');

  const headerUnit = columns[weightCol].unit;
  const inferredOrder = inferDateOrder(body.map(r => (r[dateCol] ?? '').trim()));
  const order = inferredOrder ?? dateOrder;

  const rows: Omit<WeightEntryDB, 'id'>[] = [];
  let invalidRows = 0;

  for (const record of body) {
    const dateKey = toIsoDateKey((record[dateCol] ?? '').trim(), order);
    const parsedWeight = parseWeightCell((record[weightCol] ?? '').trim());
    const unitValue = unitCol >= 0 ? (record[unitCol] ?? '').trim().toLowerCase() : '';
    const unit = unitValue ? UNIT_ALIASES[unitValue] : (parsedWeight?.unit ?? headerUnit ?? defaultUnit);

    if (!dateKey || !parsedWeight || !unit) {
      invalidRows++;
      continue;
    }

    const weightKg = unitToKg(parsedWeight.value, unit);
    if (weightKg < MIN_PLAUSIBLE_KG || weightKg > MAX_PLAUSIBLE_KG) {
      invalidRows++;
      continue;
    }

    const notes = notesCol >= 0 ? unsanitizeNotes((record[notesCol] ?? '').trim()) : '';
    rows.push({
      weight_kg: weightKg,
      logged_at: toLocalMidnightString(dateKey),
      notes: notes || undefined,
    });
  }

  return { rows, invalidRows, assumedDateOrder: inferredOrder === null && hasSlashDates(body, dateCol) };
}

function parseHeader(raw: string): { name: string; unit?: WeightUnit } {
  const lower = raw.trim().toLowerCase();
  const m = /^(.*?)[\s_]*[([]?\s*(kgs?|kilograms?|lbs?|pounds?|st|stones?)\s*[)\]]?$/.exec(lower);
  if (m && UNIT_ALIASES[m[2]]) return { name: m[1].trim(), unit: UNIT_ALIASES[m[2]] };
  return { name: lower };
}

/** Accepts "72.5", "72,5", "72.5 kg" and "1 234,5". Rejects thousands-separated or ambiguous mixes. */
function parseWeightCell(value: string): { value: number; unit?: WeightUnit } | null {
  const m = /^(\d[\d\s]*(?:[.,]\d+)?)\s*([a-z]+)?$/i.exec(value);
  if (!m) return null;
  const unit = m[2] ? UNIT_ALIASES[m[2].toLowerCase()] : undefined;
  if (m[2] && !unit) return null;
  const num = Number(m[1].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? { value: num, unit } : null;
}

const SLASH_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T ].*)?$/;

function hasSlashDates(body: string[][], col: number): boolean {
  return body.some(r => SLASH_DATE.test((r[col] ?? '').trim()));
}

/** Looks for a value whose first or second part can only be a day (>12). Null when undecidable. */
function inferDateOrder(values: string[]): DateOrder | null {
  for (const v of values) {
    const m = SLASH_DATE.exec(v);
    if (!m) continue;
    if (Number(m[1]) > 12) return 'dmy';
    if (Number(m[2]) > 12) return 'mdy';
  }
  return null;
}

/** Returns a validated "YYYY-MM-DD" from ISO, "YYYY-MM-DD hh:mm", or D/M/Y-style input; null if invalid. */
function toIsoDateKey(value: string, order: DateOrder): string | null {
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(value);
  const local = SLASH_DATE.exec(value);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (local) {
    const [a, b] = [Number(local[1]), Number(local[2])];
    [d, m] = order === 'dmy' ? [a, b] : [b, a];
    y = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t', '|'];
  let line = '';
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (line.trim()) break;
      line = '';
      continue;
    }
    line += ch;
  }
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    let count = 0;
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === c && !q) count++;
    }
    if (count > bestCount) [best, bestCount] = [c, count];
  }
  return best;
}

function escapeCsvField(value: string): string {
  const needsQuotes = /[",\r\n]/.test(value) || value !== value.trim();
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

// Spreadsheets execute cells starting with these characters as formulas.
const FORMULA_TRIGGER = /^'*[=+\-@\t\r]/;

/** Prefixes a `'` so spreadsheets treat the note as text. `unsanitizeNotes` reverses it exactly. */
function sanitizeNotes(notes: string): string {
  return FORMULA_TRIGGER.test(notes) ? `'${notes}` : notes;
}

function unsanitizeNotes(notes: string): string {
  return notes.startsWith("'") && FORMULA_TRIGGER.test(notes.slice(1)) ? notes.slice(1) : notes;
}

// RFC 4180 parser: quoted fields may contain delimiters, doubled quotes and line breaks.
function parseCsvRecords(text: string, delimiter: string): string[][] {
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
    } else if (ch === delimiter) {
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
