import { WeightEntry } from '../services/database.service';
import { decodeCsvBytes, parseWeightLogsCsv, weightLogsToCsv } from './weight-log-csv.util';

describe('weight-log-csv util', () => {
  it('round-trips notes containing commas, quotes and line breaks', () => {
    const entries = [
      { id: 1, date: '2025-09-05T00:00:00', dateMs: 0, weight: 80, trend: 80, notes: 'after "gym", late\nnight' },
    ] as WeightEntry[];

    const { rows, invalidRows } = parseWeightLogsCsv(weightLogsToCsv(entries, 'kg'), 'kg');

    expect(invalidRows).toBe(0);
    expect(rows).toEqual([{ weight_kg: 80, logged_at: '2025-09-05T00:00:00', notes: 'after "gym", late\nnight' }]);
  });

  it('converts weights from the row unit to kg and falls back to the default unit', () => {
    const csv = 'date,weight,unit\r\n2025-09-05,220,lbs\r\n2025-09-06,70,\r\n';

    const { rows } = parseWeightLogsCsv(csv, 'kg');

    expect(rows[0].weight_kg).toBeCloseTo(99.79, 1);
    expect(rows[1].weight_kg).toBe(70);
  });

  it('normalizes timestamps to local midnight and skips invalid rows', () => {
    const csv = '\uFEFFdate,weight\n2025-09-05T15:15:11Z,80\n2025-02-31,80\nnot-a-date,80\n2025-09-07,0\n2025-09-08,abc\n';

    const { rows, invalidRows } = parseWeightLogsCsv(csv, 'kg');

    expect(rows.map(r => r.logged_at)).toEqual(['2025-09-05T00:00:00']);
    expect(invalidRows).toBe(4);
  });

  it('guards notes against spreadsheet formulas and round-trips them', () => {
    const notes = ['=SUM(A1)', '+1', '-5 kg trip', '@cmd', "'=already quoted", 'plain', "it's fine"];
    const entries = notes.map(
      (n, i) => ({ id: i, date: `2025-09-0${i + 1}T00:00:00`, dateMs: 0, weight: 80, trend: 80, notes: n }) as WeightEntry,
    );

    const csv = weightLogsToCsv(entries, 'kg');

    expect(csv).toContain(",'=SUM(A1)\r\n");
    expect(csv).toContain(",plain\r\n");
    expect(parseWeightLogsCsv(csv, 'kg').rows.map(r => r.notes)).toEqual(notes);
  });

  it('recognizes a Withings export, including decimal commas in localized files', () => {
    const csv = 'Date,Gewicht (kg),Fettmasse (kg),Muskelmasse (kg)\n2026-09-28 07:26:52,"80,4",15,60\n2026-09-29 07:20:00,,,\n';

    const { rows, source, invalidRows } = parseWeightLogsCsv(csv, 'lbs');

    expect(source).toBe('Withings');
    expect(rows).toEqual([{ weight_kg: 80.4, logged_at: '2026-09-28T00:00:00', notes: undefined }]);
    expect(invalidRows).toBe(1);
    expect(parseWeightLogsCsv('date,weight\n2025-09-05,80\n', 'kg').source).toBeUndefined();
  });

  it('recognizes a WeightFit export and keeps the calendar day of offset timestamps', () => {
    const csv =
      'Date,Weight (kg),Tags,Note\n2026-11-23T09:11:50+01:00,77.6,,\n2026-11-22T00:10:25+01:00,77.8,,after run\n';

    const { rows, source, invalidRows } = parseWeightLogsCsv(csv, 'lbs');

    expect(source).toBe('WeightFit');
    expect(invalidRows).toBe(0);
    expect(rows).toEqual([
      { weight_kg: 77.6, logged_at: '2026-11-23T00:00:00', notes: undefined },
      { weight_kg: 77.8, logged_at: '2026-11-22T00:00:00', notes: 'after run' },
    ]);
  });

  it('accepts year-first dates with dashes, slashes or dots', () => {
    const csv = 'date,weight\n2025-09-05,80\n2025/09/06,80\n2025.09.07,80\n';

    const { rows, invalidRows } = parseWeightLogsCsv(csv, 'kg');

    expect(invalidRows).toBe(0);
    expect(rows.map(r => r.logged_at)).toEqual([
      '2025-09-05T00:00:00',
      '2025-09-06T00:00:00',
      '2025-09-07T00:00:00',
    ]);
  });

  it('rejects files without date and weight columns', () => {
    expect(() => parseWeightLogsCsv('foo,bar\n2025-09-05,80', 'kg')).toThrowError(/"date" and "weight"/);
  });

  it('handles semicolon delimiters, decimal commas and DD/MM/YYYY dates', () => {
    const csv = 'Date;Weight (kg);Comment\n13/09/2025;72,5;ok\n01/10/2025;"73,0";\n';

    const { rows, invalidRows, assumedDateOrder } = parseWeightLogsCsv(csv, 'lbs');

    expect(invalidRows).toBe(0);
    expect(assumedDateOrder).toBe(false);
    expect(rows).toEqual([
      { weight_kg: 72.5, logged_at: '2025-09-13T00:00:00', notes: 'ok' },
      { weight_kg: 73, logged_at: '2025-10-01T00:00:00', notes: undefined },
    ]);
  });

  it('infers MM/DD/YYYY from the file and flags fully ambiguous files', () => {
    expect(parseWeightLogsCsv('date,weight\n09/13/2025,80\n', 'kg').rows[0].logged_at).toBe('2025-09-13T00:00:00');

    const ambiguous = parseWeightLogsCsv('date,weight\n03/04/2025,80\n', 'kg');
    expect(ambiguous.assumedDateOrder).toBe(true);
    expect(ambiguous.rows[0].logged_at).toBe('2025-04-03T00:00:00');
  });

  it('reads the unit from the header or cell and rejects implausible weights', () => {
    const { rows, invalidRows } = parseWeightLogsCsv('date,weight (lbs)\n2025-09-05,220\n2025-09-06,5\n', 'kg');

    expect(rows.length).toBe(1);
    expect(rows[0].weight_kg).toBeCloseTo(99.79, 1);
    expect(invalidRows).toBe(1);
    expect(parseWeightLogsCsv('date,weight\n2025-09-05,80.5 kg\n', 'lbs').rows[0].weight_kg).toBe(80.5);
  });

  it('decodes UTF-16 and Windows-1252 files', () => {
    const utf16Bytes: number[] = [0xff, 0xfe];
    for (const c of 'date,weight'.split('')) {
      utf16Bytes.push(c.charCodeAt(0), 0);
    }
    const utf16 = new Uint8Array(utf16Bytes);
    expect(decodeCsvBytes(utf16.buffer)).toBe('date,weight');
    expect(decodeCsvBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer)).toBe('café');
  });
});
