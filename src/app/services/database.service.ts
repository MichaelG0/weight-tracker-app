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

    const mockWeights = [
      76.4, 76.3, 76.5, 75.9, 75.5, 75.6, 76.4, 75.8, 75.0, 75.0, 75.8, 75.8, 76.3, 75.8, 75.6, 75.9, 75.9, 76.3, 76.3, 76.3, 76.1, 76.2,
      76.8, 76.1, 77.6, 77.2, 76.8, 77.2, 78.0, 76.9, 76.9, 77.2, 76.7, 76.7, 77.5, 77.5, 76.9, 76.5, 76.0, 76.8, 77.1, 76.9, 77.0, 77.0,
      76.7, 76.7, 76.9, 76.5, 76.5, 76.4, 77.2, 76.5, 76.5, 76.1, 75.7, 76.1, 76.7, 76.5, 77.0, 76.1, 76.2, 76.2, 76.5, 77.0, 77.0, 76.7,
      76.4, 76.4, 75.8, 76.4, 77.4, 77.1, 77.0, 77.0, 77.5, 77.0, 77.7, 77.3, 77.7, 77.9, 77.6, 78.2, 78.2, 78.1, 77.7, 77.7, 77.6, 77.9,
      77.8, 77.5, 78.1, 78.4, 77.9, 77.8, 78.3, 77.6, 77.6, 77.1, 77.6, 77.5, 77.5, 77.6, 77.5, 77.2, 77.7, 77.7, 76.0, 77.5, 77.9, 78.1,
      78.1, 78.1, 78.1, 77.5, 77.5, 77.5, 77.5, 77.9, 78.2, 78.1, 76.7, 77.1, 77.5, 78.2, 78.5, 78.1, 78.1, 78.1, 78.1, 78.1, 78.5, 78.5,
      78.5, 79.0, 78.7, 78.8, 78.5, 78.5, 78.5, 78.5, 78.5, 78.5, 78.5, 78.9, 78.6, 78.6, 78.6, 78.6, 78.6, 78.6, 78.6, 79.2, 79.2, 78.8,
      78.8, 78.8, 78.8, 79.2, 78.8, 79.2, 78.4, 79.0, 79.0, 78.2, 78.4, 78.8, 79.1, 78.3, 79.3, 79.6, 79.7, 79.0, 79.0, 79.8, 79.2, 79.5,
      79.6, 79.2, 80.0, 79.7, 79.4, 79.8, 79.5, 79.5, 78.6, 78.9, 78.8, 78.8, 79.4, 79.0, 79.4, 79.7, 79.4, 79.5, 79.2, 79.2, 79.3, 79.7,
      79.5, 79.6, 79.9, 79.5, 78.6, 79.2, 79.3, 79.3, 79.4, 79.1, 79.8, 79.3, 79.3, 79.3, 78.8, 80.6, 79.7, 79.9, 79.5
    ];

    const today = new Date();
    today.setHours(7, 30, 0, 0);

    for (let i = 0; i < mockWeights.length; i++) {
      const loggedAt = new Date(today);
      const baseDaysAgo = mockWeights.length - 1 - i;
      const skipDays = Math.floor(baseDaysAgo / 5); // Simulate occasional missed days.
      loggedAt.setDate(today.getDate() - (baseDaysAgo + skipDays));

      await this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [
        mockWeights[i],
        loggedAt.toISOString(),
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
