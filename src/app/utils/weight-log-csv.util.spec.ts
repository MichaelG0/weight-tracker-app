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
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...'date,weight'].flatMap(c => [c.charCodeAt(0), 0])]);
    expect(decodeCsvBytes(utf16.buffer)).toBe('date,weight');
    expect(decodeCsvBytes(new Uint8Array([0x63, 0x61, 0x66, 0xe9]).buffer)).toBe('café');
  });
});
