import { Injectable } from '@angular/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import {
  BehaviorSubject,
  Observable,
  ReplaySubject,
  defer,
  from,
  of,
} from 'rxjs';
import { map, switchMap, take, tap } from 'rxjs/operators';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id?: number;
  weight_kg: number;
  logged_at: string; // ISO-8601
  notes?: string;
}

export interface UserSettings {
  user_id: number;
  age?: number;
  gender?: string;
  height: number; // cm
  goal_weight_kg?: number;
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS weight_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    weight_kg  REAL NOT NULL,
    logged_at  TEXT NOT NULL,
    notes      TEXT
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id        INTEGER PRIMARY KEY,
    age            INTEGER,
    gender         TEXT,
    height         REAL NOT NULL,
    goal_weight_kg REAL
  );
`;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;

  // Emits once (and replays to late subscribers) when the DB is ready.
  // All public methods pipe through ready$ so callers never need to wait.
  private readonly ready$ = new ReplaySubject<void>(1);

  // ── Reactive collections ──────────────────────────────────────────────────
  // Subscribe in components — updated automatically after every mutation.

  private readonly _entries$ = new BehaviorSubject<WeightEntry[]>([]);
  private readonly _settings$ = new BehaviorSubject<UserSettings | null>(null);

  readonly entries$: Observable<WeightEntry[]> = this._entries$.asObservable();
  readonly settings$: Observable<UserSettings | null> = this._settings$.asObservable();

  // ── Init (called from provideAppInitializer in main.ts) ───────────────────

  async initializePlugin(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      await customElements.whenDefined('jeep-sqlite');
      await this.sqlite.initWebStore();
    }

    this.db = await this.sqlite.createConnection(
      'weight_tracker', false, 'no-encryption', 1, false
    );
    await this.db.open();
    await this.db.execute(MIGRATIONS);

    // Signal readiness and pre-load reactive state.
    this.ready$.next();
    await Promise.all([
      this.syncEntries(),
      this.syncSettings(),
    ]);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  // Gates any operation on DB readiness. Swap the inner Observable for HTTP
  // calls when migrating to a backend — the public API stays identical.
  private whenReady<T>(operation: () => Observable<T>): Observable<T> {
    return this.ready$.pipe(take(1), switchMap(() => operation()));
  }

  private async syncEntries(): Promise<void> {
    const r = await this.db.query(
      `SELECT * FROM weight_entries ORDER BY logged_at DESC`
    );
    this._entries$.next((r.values ?? []) as WeightEntry[]);
  }

  private async syncSettings(): Promise<void> {
    const r = await this.db.query(
      `SELECT * FROM user_settings WHERE user_id = 1`
    );
    this._settings$.next(r.values?.[0] ?? null);
  }

  // ── Weight entries ────────────────────────────────────────────────────────

  addEntry(entry: Omit<WeightEntry, 'id'>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(
          `INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`,
          [entry.weight_kg, entry.logged_at, entry.notes ?? null]
        )
      ).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined)
      )
    );
  }

  updateEntry(entry: Required<Pick<WeightEntry, 'id'>> & Partial<WeightEntry>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(
          `UPDATE weight_entries
             SET weight_kg = COALESCE(?, weight_kg),
                 logged_at = COALESCE(?, logged_at),
                 notes     = COALESCE(?, notes)
           WHERE id = ?`,
          [entry.weight_kg ?? null, entry.logged_at ?? null, entry.notes ?? null, entry.id]
        )
      ).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined)
      )
    );
  }

  deleteEntry(id: number): Observable<void> {
    return this.whenReady(() =>
      from(this.db.run(`DELETE FROM weight_entries WHERE id = ?`, [id])).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined)
      )
    );
  }

  getEntry(id: number): Observable<WeightEntry | null> {
    return this.whenReady(() =>
      from(
        this.db.query(`SELECT * FROM weight_entries WHERE id = ?`, [id])
      ).pipe(map(r => (r.values?.[0] as WeightEntry) ?? null))
    );
  }

  // ── User settings ─────────────────────────────────────────────────────────

  // Upserts the single settings row (user_id = 1).
  saveSettings(settings: Omit<UserSettings, 'user_id'>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(
          `INSERT INTO user_settings (user_id, age, gender, height, goal_weight_kg)
             VALUES (1, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             age            = excluded.age,
             gender         = excluded.gender,
             height         = excluded.height,
             goal_weight_kg = excluded.goal_weight_kg`,
          [
            settings.age ?? null,
            settings.gender ?? null,
            settings.height,
            settings.goal_weight_kg ?? null,
          ]
        )
      ).pipe(
        switchMap(() => from(this.syncSettings())),
        map(() => undefined)
      )
    );
  }
}
