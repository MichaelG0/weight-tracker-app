import { WeightEntry } from '../services/database.service';
import { parseWeightLogsCsv, weightLogsToCsv } from './weight-log-csv.util';

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
    expect(() => parseWeightLogsCsv('day,kg\n2025-09-05,80', 'kg')).toThrowError(/"date" and "weight"/);
  });
});
