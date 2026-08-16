import { computed, inject, Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatabaseService, WeightEntry } from './database.service';

export interface TrendPoint {
  date: number; // timestamp ms
  weight: number; // scale weight in user unit
  trend: number; // EWMA in user unit
}

const ALPHA = 0.1;

@Injectable({ providedIn: 'root' })
export class TrendService {
  private readonly db = inject(DatabaseService);

  private readonly entries = toSignal(this.db.entries$, { initialValue: [] as WeightEntry[] });

  /** All entries with their computed EWMA trend value, sorted oldest → newest. */
  readonly points: Signal<TrendPoint[]> = computed(() => {
    const entries = this.entries();
    if (!entries.length) return [];

    const pts: TrendPoint[] = [];
    let ewma = entries[0].weight_kg;

    for (const entry of entries) {
      ewma = ewma + ALPHA * (entry.weight_kg - ewma);
      pts.push({
        date: +new Date(entry.logged_at),
        weight: entry.weight_kg,
        trend: ewma,
      });
    }

    return pts;
  });

  /** Current trend weight (latest EWMA value), or null if no entries. */
  readonly currentTrend: Signal<number | null> = computed(() => {
    const pts = this.points();
    return pts.length ? pts[pts.length - 1].trend : null;
  });

  /** Trend value at or before a given timestamp. */
  trendAt(timestampMs: number): number | null {
    const pts = this.points();
    if (!pts.length || timestampMs < pts[0].date) return null;

    // Binary search for the last index where pt.date <= timestampMs.
    let lo = 0;
    let hi = pts.length - 1;
    let result = -1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (pts[mid].date <= timestampMs) {
        result = mid;
        lo = mid + 1; // keep searching right for a later valid index
      } else {
        hi = mid - 1;
      }
    }

    return result === -1 ? null : pts[result].trend;
  }
}
