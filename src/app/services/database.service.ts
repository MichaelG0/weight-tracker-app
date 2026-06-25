import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Observable, ReplaySubject, defer, from, of } from 'rxjs';
import { map, switchMap, take, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

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
  height_cm: number;
  goal_weight_kg?: number;
  goal_date: string; // ISO-8601
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
    height_cm      REAL,
    goal_weight_kg REAL,
    goal_date      TEXT
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

    this.db = await this.sqlite.createConnection('weight_tracker', false, 'no-encryption', 1, false);
    await this.db.open();
    await this.db.execute(MIGRATIONS);

    if (!environment.production) {
      await this.seedMockData();
    }

    // Signal readiness and pre-load reactive state.
    this.ready$.next();
    await Promise.all([this.syncEntries(), this.syncSettings()]);
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  // Gates any operation on DB readiness. Swap the inner Observable for HTTP
  // calls when migrating to a backend — the public API stays identical.
  private whenReady<T>(operation: () => Observable<T>): Observable<T> {
    return this.ready$.pipe(
      take(1),
      switchMap(() => operation()),
    );
  }

  private async syncEntries(): Promise<void> {
    const r = await this.db.query(`SELECT * FROM weight_entries ORDER BY logged_at DESC`);
    this._entries$.next((r.values ?? []) as WeightEntry[]);
  }

  private async syncSettings(): Promise<void> {
    const r = await this.db.query(`SELECT * FROM user_settings WHERE user_id = 1`);
    this._settings$.next(r.values?.[0] ?? null);
  }

  // ── Mock data ──────────────────────────────────────────────────────────────

  private async seedMockData(): Promise<void> {
    await this.db.run(
      `INSERT INTO user_settings (user_id, age, gender, height_cm, goal_weight_kg, goal_date)
       VALUES (1, ?, ?, ?, ?, ?)`,
      [31, 'M', 178, 80, new Date('2026-07-01').toISOString()],
    );

    const mockData: [string, number][] = [
      ['2025-09-05', 76.0], ['2025-09-06', 76.4], ['2025-09-07', 76.3], ['2025-09-08', 76.5], ['2025-09-09', 75.9],
      ['2025-09-11', 75.5], ['2025-09-12', 75.6], ['2025-09-13', 76.4], ['2025-09-16', 75.8], ['2025-09-17', 75.0],
      ['2025-09-18', 75.0], ['2025-09-21', 75.8], ['2025-09-22', 75.8], ['2025-09-23', 76.3], ['2025-09-24', 75.8],
      ['2025-09-26', 75.6], ['2025-09-28', 75.9], ['2025-09-29', 75.9], ['2025-09-30', 76.3], ['2025-10-02', 76.3],
      ['2025-10-03', 76.3], ['2025-10-05', 76.1], ['2025-10-06', 76.2], ['2025-10-07', 76.8], ['2025-10-09', 76.1],
      ['2025-10-10', 77.6], ['2025-10-11', 77.2], ['2025-10-12', 76.8], ['2025-10-13', 77.2], ['2025-10-14', 78.0],
      ['2025-10-15', 76.9], ['2025-10-16', 76.9], ['2025-10-17', 77.2], ['2025-10-18', 76.7], ['2025-10-19', 76.7],
      ['2025-10-20', 77.5], ['2025-10-21', 77.5], ['2025-10-22', 76.9], ['2025-10-23', 76.5], ['2025-10-24', 76.0],
      ['2025-10-25', 76.8], ['2025-10-27', 77.1], ['2025-10-31', 76.9], ['2025-11-02', 77.0], ['2025-11-03', 77.0],
      ['2025-11-05', 76.7], ['2025-11-06', 76.7], ['2025-11-07', 76.9], ['2025-11-08', 76.5], ['2025-11-09', 76.5],
      ['2025-11-10', 76.4], ['2025-11-11', 77.2], ['2025-11-12', 76.5], ['2025-11-13', 76.5], ['2025-11-15', 76.1],
      ['2025-11-17', 75.7], ['2025-11-18', 76.1], ['2025-11-19', 76.7], ['2025-11-20', 76.5], ['2025-11-21', 77.0],
      ['2025-11-23', 76.1], ['2025-11-24', 76.2], ['2025-11-25', 76.2], ['2025-11-26', 76.5], ['2025-11-27', 77.0],
      ['2025-11-28', 77.0], ['2025-11-29', 76.7], ['2025-12-06', 76.4], ['2025-12-07', 76.4], ['2025-12-08', 75.8],
      ['2025-12-09', 76.4], ['2025-12-10', 77.4], ['2025-12-11', 77.1], ['2025-12-12', 77.0], ['2025-12-13', 77.0],
      ['2025-12-14', 77.5], ['2025-12-15', 77.0], ['2025-12-16', 77.7], ['2025-12-17', 77.3], ['2025-12-18', 77.7],
      ['2025-12-19', 77.9], ['2025-12-20', 77.6], ['2025-12-21', 78.2], ['2025-12-22', 78.2], ['2025-12-23', 78.1],
      ['2025-12-24', 77.7], ['2025-12-25', 77.7], ['2025-12-26', 77.6], ['2025-12-27', 77.9], ['2025-12-28', 77.8],
      ['2025-12-29', 77.5], ['2025-12-30', 78.1], ['2025-12-31', 78.4], ['2026-01-02', 77.9], ['2026-01-03', 77.8],
      ['2026-01-04', 78.3], ['2026-01-06', 77.6], ['2026-01-10', 77.6], ['2026-01-11', 77.1], ['2026-01-12', 77.6],
      ['2026-01-13', 77.5], ['2026-01-14', 77.5], ['2026-01-15', 77.6], ['2026-01-17', 77.5], ['2026-01-18', 77.2],
      ['2026-01-19', 77.7], ['2026-01-20', 77.7], ['2026-01-23', 76.0], ['2026-01-24', 77.5], ['2026-01-25', 77.9],
      ['2026-01-26', 78.1], ['2026-01-27', 78.1], ['2026-01-28', 78.1], ['2026-01-29', 78.1], ['2026-01-30', 77.5],
      ['2026-01-31', 77.5], ['2026-02-01', 77.5], ['2026-02-02', 77.5], ['2026-02-03', 77.9], ['2026-02-04', 78.2],
      ['2026-02-05', 78.1], ['2026-02-06', 76.7], ['2026-02-07', 77.1], ['2026-02-08', 77.5], ['2026-02-09', 78.2],
      ['2026-02-11', 78.5], ['2026-02-12', 78.1], ['2026-02-14', 78.1], ['2026-02-15', 78.1], ['2026-02-16', 78.1],
      ['2026-02-17', 78.5], ['2026-02-18', 78.5], ['2026-02-19', 78.5], ['2026-02-20', 79.0], ['2026-02-21', 78.7],
      ['2026-02-22', 78.8], ['2026-02-23', 78.5], ['2026-02-24', 78.5], ['2026-02-25', 78.5], ['2026-02-26', 78.5],
      ['2026-02-27', 78.5], ['2026-02-28', 78.5], ['2026-03-01', 78.5], ['2026-03-02', 78.9], ['2026-03-03', 78.6],
      ['2026-03-04', 78.6], ['2026-03-05', 78.6], ['2026-03-06', 78.6], ['2026-03-07', 78.6], ['2026-03-08', 78.6],
      ['2026-03-09', 78.6], ['2026-03-10', 79.2], ['2026-03-11', 79.2], ['2026-03-12', 78.8], ['2026-03-14', 78.8],
      ['2026-03-15', 78.8], ['2026-03-16', 78.8], ['2026-03-17', 79.2], ['2026-03-18', 78.8], ['2026-03-19', 79.2],
      ['2026-03-20', 78.4], ['2026-03-21', 79.0], ['2026-03-22', 79.0], ['2026-03-23', 78.2], ['2026-03-24', 78.4],
      ['2026-03-27', 78.8], ['2026-03-28', 79.1], ['2026-03-29', 78.3], ['2026-03-30', 79.3], ['2026-03-31', 79.6],
      ['2026-04-01', 79.7], ['2026-04-02', 79.0], ['2026-04-03', 79.0], ['2026-04-07', 79.8], ['2026-04-08', 79.2],
      ['2026-04-09', 79.5], ['2026-04-13', 79.6], ['2026-04-14', 79.2], ['2026-04-16', 80.0], ['2026-04-17', 79.7],
      ['2026-04-19', 79.4], ['2026-04-20', 79.8], ['2026-04-21', 79.5], ['2026-04-22', 79.5], ['2026-05-03', 78.6],
      ['2026-05-04', 78.9], ['2026-05-05', 78.8], ['2026-05-06', 78.8], ['2026-05-07', 79.4], ['2026-05-09', 79.0],
      ['2026-05-10', 79.4], ['2026-05-11', 79.7], ['2026-05-12', 79.4], ['2026-05-14', 79.5], ['2026-05-16', 79.2],
      ['2026-05-17', 79.2], ['2026-05-18', 79.3], ['2026-05-20', 79.7], ['2026-05-22', 79.5], ['2026-05-23', 79.6],
      ['2026-05-24', 79.9], ['2026-05-26', 79.5], ['2026-05-28', 78.6], ['2026-05-29', 79.2], ['2026-05-30', 79.3],
      ['2026-05-31', 79.3], ['2026-06-01', 79.4], ['2026-06-02', 79.1], ['2026-06-03', 79.8], ['2026-06-04', 79.3],
      ['2026-06-05', 79.3], ['2026-06-06', 79.3], ['2026-06-08', 78.8], ['2026-06-09', 80.6], ['2026-06-10', 79.7],
      ['2026-06-11', 79.9], ['2026-06-12', 79.5], ['2026-06-15', 79.7], ['2026-06-17', 79.9], ['2026-06-18', 79.6],
      ['2026-06-19', 79.9], ['2026-06-20', 80.0], ['2026-06-21', 80.1], ['2026-06-22', 80.6], ['2026-06-23', 80.0],
      ['2026-06-24', 80.2], ['2026-06-25', 80.3],
    ];

    for (const [date, weight] of mockData) {
      await this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [
        weight,
        date,
        'Mock seed data (lean bulk)',
      ]);
    }
  }

  // ── Weight entries ────────────────────────────────────────────────────────

  addEntry(entry: Omit<WeightEntry, 'id'>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [
          entry.weight_kg,
          entry.logged_at,
          entry.notes ?? null,
        ]),
      ).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined),
      ),
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
          [entry.weight_kg ?? null, entry.logged_at ?? null, entry.notes ?? null, entry.id],
        ),
      ).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined),
      ),
    );
  }

  deleteEntry(id: number): Observable<void> {
    return this.whenReady(() =>
      from(this.db.run(`DELETE FROM weight_entries WHERE id = ?`, [id])).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined),
      ),
    );
  }

  getEntry(id: number): Observable<WeightEntry | null> {
    return this.whenReady(() =>
      from(this.db.query(`SELECT * FROM weight_entries WHERE id = ?`, [id])).pipe(map(r => (r.values?.[0] as WeightEntry) ?? null)),
    );
  }

  // ── User settings ─────────────────────────────────────────────────────────

  // Upserts the single settings row (user_id = 1).
  saveSettings(settings: Omit<UserSettings, 'user_id'>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(
          `INSERT INTO user_settings (user_id, age, gender, height_cm, goal_weight_kg, goal_date)
             VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             age            = excluded.age,
             gender         = excluded.gender,
             height_cm         = excluded.height_cm,
             goal_weight_kg = excluded.goal_weight_kg,
             goal_date      = excluded.goal_date`,
          [settings.age ?? null, settings.gender ?? null, settings.height_cm, settings.goal_weight_kg ?? null, settings.goal_date ?? null],
        ),
      ).pipe(
        switchMap(() => from(this.syncSettings())),
        map(() => undefined),
      ),
    );
  }
}
