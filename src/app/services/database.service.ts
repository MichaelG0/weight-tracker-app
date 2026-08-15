import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Observable, ReplaySubject, from } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { cmToFtIn, kgToUnit, ftInToCm, unitToKg } from '../utils/unit-conversion.util';

// ─── Models ──────────────────────────────────────────────────────────────────

export interface WeightEntry {
  id: number;
  weight_kg: number;
  logged_at: string; // ISO-8601
  notes?: string;
}

export type GoalType = 'weight gain' | 'weight loss' | 'maintenance';

export interface Goal {
  id: number;
  start_weight_kg: number;
  goal_weight_kg: number;
  start_date: string; // ISO-8601
  goal_date: string; // ISO-8601
  label: GoalType;
}

export type WeightUnit = 'kg' | 'lbs' | 'st';
export type HeightUnit = 'cm' | 'ft/in';

export interface HeightFtIn {
  feet: number | null;
  inches: number | null;
}

export interface UserSettings {
  user_id: number;
  name?: string;
  age?: number;
  gender?: string;
  height_cm?: number;
  heightFtIn?: HeightFtIn;
  weight_unit?: WeightUnit;
  height_unit?: HeightUnit;
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
    name           TEXT,
    age            INTEGER,
    gender         TEXT,
    height_cm      REAL,
    weight_unit    TEXT DEFAULT 'kg',
    height_unit    TEXT DEFAULT 'cm'
  );

  CREATE TABLE IF NOT EXISTS goals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    start_weight_kg REAL NOT NULL DEFAULT 0,
    goal_weight_kg REAL NOT NULL,
    start_date     TEXT NOT NULL,
    goal_date      TEXT NOT NULL,
    label          TEXT
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
  // Weight values are emitted already converted to the user's preferred unit.

  private readonly _entries$ = new BehaviorSubject<WeightEntry[]>([]);
  private readonly _settings$ = new BehaviorSubject<UserSettings | null>(null);
  private readonly _goals$ = new BehaviorSubject<Goal[]>([]);

  readonly entries$: Observable<WeightEntry[]> = this._entries$.asObservable().pipe(
    map(entries => {
      const unit = this.currentWeightUnit;
      const converted = entries
        .sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at))
        .map(e => ({
          ...e,
          weight_kg: kgToUnit(e.weight_kg, unit),
        }));
      return converted;
    }),
  );
  readonly settings$: Observable<UserSettings | null> = this._settings$.asObservable().pipe(
    map(settings => {
      if (!settings) return null;
      const converted: UserSettings = {
        ...settings,
        heightFtIn: settings.height_cm ? cmToFtIn(settings.height_cm) : undefined,
      };
      return converted;
    }),
  );
  readonly goals$: Observable<Goal[]> = this._goals$.asObservable().pipe(
    map(goals => {
      const unit = this.currentWeightUnit;
      const converted = goals.map(g => ({
        ...g,
        start_weight_kg: kgToUnit(g.start_weight_kg, unit),
        goal_weight_kg: kgToUnit(g.goal_weight_kg, unit),
      }));
      return converted;
    }),
  );
  readonly weightUnit$: Observable<WeightUnit> = this._settings$.pipe(map(s => s?.weight_unit ?? 'kg'));

  // ── Getters ──────────────────────────────────────────────────────

  private get currentWeightUnit(): WeightUnit {
    return this._settings$.value?.weight_unit ?? 'kg';
  }

  private get currentHeightUnit(): HeightUnit {
    return this._settings$.value?.height_unit ?? 'cm';
  }

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
    await Promise.all([this.syncEntries(), this.syncSettings(), this.syncGoals()]);
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

  private async syncGoals(): Promise<void> {
    const r = await this.db.query(`SELECT * FROM goals ORDER BY goal_date ASC`);
    this._goals$.next((r.values ?? []) as Goal[]);
  }

  // ── Mock data ──────────────────────────────────────────────────────────────

  private async seedMockData(): Promise<void> {
    await this.db.run(
      `INSERT INTO user_settings (user_id, name, age, gender, height_cm)
       VALUES (1, ?, ?, ?, ?)`,
      ['Michael', 31, 'Male', 178],
    );

    const mockGoals: Omit<Goal, 'id'>[] = [
      { start_weight_kg: 76, goal_weight_kg: 80, start_date: '2025-09-05', goal_date: '2026-07-01', label: 'weight gain' },
      { start_weight_kg: 80, goal_weight_kg: 80, start_date: '2026-07-01', goal_date: '2026-08-09', label: 'maintenance' },
      { start_weight_kg: 80, goal_weight_kg: 76, start_date: '2026-08-09', goal_date: '2026-10-11', label: 'weight loss' },
      { start_weight_kg: 76, goal_weight_kg: 79, start_date: '2026-10-11', goal_date: '2027-04-11', label: 'weight gain' },
    ];

    for (const goal of mockGoals) {
      await this.db.run(`INSERT INTO goals (start_weight_kg, goal_weight_kg, start_date, goal_date, label) VALUES (?, ?, ?, ?, ?)`, [
        goal.start_weight_kg,
        goal.goal_weight_kg,
        goal.start_date,
        goal.goal_date,
        goal.label,
      ]);
    }

    const mockData: [string, number][] = [
      ['2025-09-05T00:00:00', 76.0],
      ['2025-09-06T00:00:00', 76.4],
      ['2025-09-07T00:00:00', 76.3],
      ['2025-09-08T00:00:00', 76.5],
      ['2025-09-09T00:00:00', 75.9],
      ['2025-09-11T00:00:00', 75.5],
      ['2025-09-12T00:00:00', 75.6],
      ['2025-09-13T00:00:00', 76.4],
      ['2025-09-16T00:00:00', 75.8],
      ['2025-09-17T00:00:00', 75.0],
      ['2025-09-18T00:00:00', 75.0],
      ['2025-09-21T00:00:00', 75.8],
      ['2025-09-22T00:00:00', 75.8],
      ['2025-09-23T00:00:00', 76.3],
      ['2025-09-24T00:00:00', 75.8],
      ['2025-09-26T00:00:00', 75.6],
      ['2025-09-28T00:00:00', 75.9],
      ['2025-09-29T00:00:00', 75.9],
      ['2025-09-30T00:00:00', 76.3],
      ['2025-10-02T00:00:00', 76.3],
      ['2025-10-03T00:00:00', 76.3],
      ['2025-10-05T00:00:00', 76.1],
      ['2025-10-06T00:00:00', 76.2],
      ['2025-10-07T00:00:00', 76.8],
      ['2025-10-09T00:00:00', 76.1],
      ['2025-10-10T00:00:00', 77.6],
      ['2025-10-11T00:00:00', 77.2],
      ['2025-10-12T00:00:00', 76.8],
      ['2025-10-13T00:00:00', 77.2],
      ['2025-10-14T00:00:00', 78.0],
      ['2025-10-15T00:00:00', 76.9],
      ['2025-10-16T00:00:00', 76.9],
      ['2025-10-17T00:00:00', 77.2],
      ['2025-10-18T00:00:00', 76.7],
      ['2025-10-19T00:00:00', 76.7],
      ['2025-10-20T00:00:00', 77.5],
      ['2025-10-21T00:00:00', 77.5],
      ['2025-10-22T00:00:00', 76.9],
      ['2025-10-23T00:00:00', 76.5],
      ['2025-10-24T00:00:00', 76.0],
      ['2025-10-25T00:00:00', 76.8],
      ['2025-10-27T00:00:00', 77.1],
      ['2025-10-31T00:00:00', 76.9],
      ['2025-11-02T00:00:00', 77.0],
      ['2025-11-03T00:00:00', 77.0],
      ['2025-11-05T00:00:00', 76.7],
      ['2025-11-06T00:00:00', 76.7],
      ['2025-11-07T00:00:00', 76.9],
      ['2025-11-08T00:00:00', 76.5],
      ['2025-11-09T00:00:00', 76.5],
      ['2025-11-10T00:00:00', 76.4],
      ['2025-11-11T00:00:00', 77.2],
      ['2025-11-12T00:00:00', 76.5],
      ['2025-11-13T00:00:00', 76.5],
      ['2025-11-15T00:00:00', 76.1],
      ['2025-11-17T00:00:00', 75.7],
      ['2025-11-18T00:00:00', 76.1],
      ['2025-11-19T00:00:00', 76.7],
      ['2025-11-20T00:00:00', 76.5],
      ['2025-11-21T00:00:00', 77.0],
      ['2025-11-23T00:00:00', 76.1],
      ['2025-11-24T00:00:00', 76.2],
      ['2025-11-25T00:00:00', 76.2],
      ['2025-11-26T00:00:00', 76.5],
      ['2025-11-27T00:00:00', 77.0],
      ['2025-11-28T00:00:00', 77.0],
      ['2025-11-29T00:00:00', 76.7],
      ['2025-12-06T00:00:00', 76.4],
      ['2025-12-07T00:00:00', 76.4],
      ['2025-12-08T00:00:00', 75.8],
      ['2025-12-09T00:00:00', 76.4],
      ['2025-12-10T00:00:00', 77.4],
      ['2025-12-11T00:00:00', 77.1],
      ['2025-12-12T00:00:00', 77.0],
      ['2025-12-13T00:00:00', 77.0],
      ['2025-12-14T00:00:00', 77.5],
      ['2025-12-15T00:00:00', 77.0],
      ['2025-12-16T00:00:00', 77.7],
      ['2025-12-17T00:00:00', 77.3],
      ['2025-12-18T00:00:00', 77.7],
      ['2025-12-19T00:00:00', 77.9],
      ['2025-12-20T00:00:00', 77.6],
      ['2025-12-21T00:00:00', 78.2],
      ['2025-12-22T00:00:00', 78.2],
      ['2025-12-23T00:00:00', 78.1],
      ['2025-12-24T00:00:00', 77.7],
      ['2025-12-25T00:00:00', 77.7],
      ['2025-12-26T00:00:00', 77.6],
      ['2025-12-27T00:00:00', 77.9],
      ['2025-12-28T00:00:00', 77.8],
      ['2025-12-29T00:00:00', 77.5],
      ['2025-12-30T00:00:00', 78.1],
      ['2025-12-31T00:00:00', 78.4],
      ['2026-01-02T00:00:00', 77.9],
      ['2026-01-03T00:00:00', 77.8],
      ['2026-01-04T00:00:00', 78.3],
      ['2026-01-06T00:00:00', 77.6],
      ['2026-01-10T00:00:00', 77.6],
      ['2026-01-11T00:00:00', 77.1],
      ['2026-01-12T00:00:00', 77.6],
      ['2026-01-13T00:00:00', 77.5],
      ['2026-01-14T00:00:00', 77.5],
      ['2026-01-15T00:00:00', 77.6],
      ['2026-01-17T00:00:00', 77.5],
      ['2026-01-18T00:00:00', 77.2],
      ['2026-01-19T00:00:00', 77.7],
      ['2026-01-20T00:00:00', 77.7],
      ['2026-01-23T00:00:00', 76.0],
      ['2026-01-24T00:00:00', 77.5],
      ['2026-01-25T00:00:00', 77.9],
      ['2026-01-26T00:00:00', 78.1],
      ['2026-01-27T00:00:00', 78.1],
      ['2026-01-28T00:00:00', 78.1],
      ['2026-01-29T00:00:00', 78.1],
      ['2026-01-30T00:00:00', 77.5],
      ['2026-01-31T00:00:00', 77.5],
      ['2026-02-01T00:00:00', 77.5],
      ['2026-02-02T00:00:00', 77.5],
      ['2026-02-03T00:00:00', 77.9],
      ['2026-02-04T00:00:00', 78.2],
      ['2026-02-05T00:00:00', 78.1],
      ['2026-02-06T00:00:00', 76.7],
      ['2026-02-07T00:00:00', 77.1],
      ['2026-02-08T00:00:00', 77.5],
      ['2026-02-09T00:00:00', 78.2],
      ['2026-02-11T00:00:00', 78.5],
      ['2026-02-12T00:00:00', 78.1],
      ['2026-02-14T00:00:00', 78.1],
      ['2026-02-15T00:00:00', 78.1],
      ['2026-02-16T00:00:00', 78.1],
      ['2026-02-17T00:00:00', 78.5],
      ['2026-02-18T00:00:00', 78.5],
      ['2026-02-19T00:00:00', 78.5],
      ['2026-02-20T00:00:00', 79.0],
      ['2026-02-21T00:00:00', 78.7],
      ['2026-02-22T00:00:00', 78.8],
      ['2026-02-23T00:00:00', 78.5],
      ['2026-02-24T00:00:00', 78.5],
      ['2026-02-25T00:00:00', 78.5],
      ['2026-02-26T00:00:00', 78.5],
      ['2026-02-27T00:00:00', 78.5],
      ['2026-02-28T00:00:00', 78.5],
      ['2026-03-01T00:00:00', 78.5],
      ['2026-03-02T00:00:00', 78.9],
      ['2026-03-03T00:00:00', 78.6],
      ['2026-03-04T00:00:00', 78.6],
      ['2026-03-05T00:00:00', 78.6],
      ['2026-03-06T00:00:00', 78.6],
      ['2026-03-07T00:00:00', 78.6],
      ['2026-03-08T00:00:00', 78.6],
      ['2026-03-09T00:00:00', 78.6],
      ['2026-03-10T00:00:00', 79.2],
      ['2026-03-11T00:00:00', 79.2],
      ['2026-03-12T00:00:00', 78.8],
      ['2026-03-14T00:00:00', 78.8],
      ['2026-03-15T00:00:00', 78.8],
      ['2026-03-16T00:00:00', 78.8],
      ['2026-03-17T00:00:00', 79.2],
      ['2026-03-18T00:00:00', 78.8],
      ['2026-03-19T00:00:00', 79.2],
      ['2026-03-20T00:00:00', 78.4],
      ['2026-03-21T00:00:00', 79.0],
      ['2026-03-22T00:00:00', 79.0],
      ['2026-03-23T00:00:00', 78.2],
      ['2026-03-24T00:00:00', 78.4],
      ['2026-03-27T00:00:00', 78.8],
      ['2026-03-28T00:00:00', 79.1],
      ['2026-03-29T00:00:00', 78.3],
      ['2026-03-30T00:00:00', 79.3],
      ['2026-03-31T00:00:00', 79.6],
      ['2026-04-01T00:00:00', 79.7],
      ['2026-04-02T00:00:00', 79.0],
      ['2026-04-03T00:00:00', 79.0],
      ['2026-04-07T00:00:00', 79.8],
      ['2026-04-08T00:00:00', 79.2],
      ['2026-04-09T00:00:00', 79.5],
      ['2026-04-13T00:00:00', 79.6],
      ['2026-04-14T00:00:00', 79.2],
      ['2026-04-16T00:00:00', 80.0],
      ['2026-04-17T00:00:00', 79.7],
      ['2026-04-19T00:00:00', 79.4],
      ['2026-04-20T00:00:00', 79.8],
      ['2026-04-21T00:00:00', 79.5],
      ['2026-04-22T00:00:00', 79.5],
      ['2026-05-03T00:00:00', 78.6],
      ['2026-05-04T00:00:00', 78.9],
      ['2026-05-05T00:00:00', 78.8],
      ['2026-05-06T00:00:00', 78.8],
      ['2026-05-07T00:00:00', 79.4],
      ['2026-05-09T00:00:00', 79.0],
      ['2026-05-10T00:00:00', 79.4],
      ['2026-05-11T00:00:00', 79.7],
      ['2026-05-12T00:00:00', 79.4],
      ['2026-05-14T00:00:00', 79.5],
      ['2026-05-16T00:00:00', 79.2],
      ['2026-05-17T00:00:00', 79.2],
      ['2026-05-18T00:00:00', 79.3],
      ['2026-05-20T00:00:00', 79.7],
      ['2026-05-22T00:00:00', 79.5],
      ['2026-05-23T00:00:00', 79.6],
      ['2026-05-24T00:00:00', 79.9],
      ['2026-05-26T00:00:00', 79.5],
      ['2026-05-28T00:00:00', 78.6],
      ['2026-05-29T00:00:00', 79.2],
      ['2026-05-30T00:00:00', 79.3],
      ['2026-05-31T00:00:00', 79.3],
      ['2026-06-01T00:00:00', 79.4],
      ['2026-06-02T00:00:00', 79.1],
      ['2026-06-03T00:00:00', 79.8],
      ['2026-06-04T00:00:00', 79.3],
      ['2026-06-05T00:00:00', 79.3],
      ['2026-06-06T00:00:00', 79.3],
      ['2026-06-08T00:00:00', 78.8],
      ['2026-06-09T00:00:00', 80.6],
      ['2026-06-10T00:00:00', 79.7],
      ['2026-06-11T00:00:00', 79.9],
      ['2026-06-12T00:00:00', 79.5],
      ['2026-06-15T00:00:00', 79.7],
      ['2026-06-17T00:00:00', 79.9],
      ['2026-06-18T00:00:00', 79.6],
      ['2026-06-19T00:00:00', 79.9],
      ['2026-06-20T00:00:00', 80.0],
      ['2026-06-21T00:00:00', 80.1],
      ['2026-06-22T00:00:00', 80.6],
      ['2026-06-23T00:00:00', 80.0],
      ['2026-06-24T00:00:00', 80.2],
      ['2026-06-25T00:00:00', 80.3],
      ['2026-06-26T00:00:00', 80.3],
      ['2026-06-27T00:00:00', 80.5],
      ['2026-06-28T00:00:00', 80.3],
      ['2026-06-29T00:00:00', 80.3],
      ['2026-06-30T00:00:00', 79.9],
      ['2026-07-01T00:00:00', 79.9],
      ['2026-07-03T00:00:00', 80.3],
      ['2026-07-04T00:00:00', 79.7],
      ['2026-07-08T00:00:00', 79.7],
      ['2026-07-09T00:00:00', 79.0],
      ['2026-07-10T00:00:00', 79.7],
      ['2026-07-11T00:00:00', 79.6],
      ['2026-07-12T00:00:00', 80.0],
      ['2026-07-13T00:00:00', 80.4],
      ['2026-07-14T00:00:00', 80.2],
      ['2026-07-16T00:00:00', 79.7],
      ['2026-07-17T00:00:00', 80.1],
      ['2026-07-18T00:00:00', 80.1],
      ['2026-07-19T00:00:00', 80.6],
      ['2026-07-20T00:00:00', 79.7],
      ['2026-07-21T00:00:00', 79.9],
      ['2026-07-22T00:00:00', 79.7],
      ['2026-07-24T00:00:00', 79.8],
      ['2026-07-25T00:00:00', 79.7],
      ['2026-07-26T00:00:00', 80.0],
      ['2026-07-27T00:00:00', 79.9],
      ['2026-07-28T00:00:00', 79.9],
      ['2026-07-29T00:00:00', 79.6],
      ['2026-07-30T00:00:00', 80.1],
      ['2026-07-31T00:00:00', 80.3],
      ['2026-08-01T00:00:00', 79.8],
      ['2026-08-02T00:00:00', 79.8],
      ['2026-08-03T00:00:00', 80.1],
      ['2026-08-04T00:00:00', 80.2],
      ['2026-08-05T00:00:00', 79.9],
      ['2026-08-06T00:00:00', 79.7],
      ['2026-08-07T00:00:00', 79.6],
      ['2026-08-08T00:00:00', 79.7],
      ['2026-08-09T00:00:00', 79.8],
      ['2026-08-10T00:00:00', 80.3],
      ['2026-08-11T00:00:00', 80.1],
      ['2026-08-12T00:00:00', 79.2],
      ['2026-08-13T00:00:00', 79.3],
    ];

    // Increase iterations to generate additional randomized mock data.
    for (let i = 0; i < 0; i++) {
      const date = new Date(2025, 8, 1); // September 1, 2025
      date.setDate(date.getDate() - i);
      const weight = 75 + Math.random() + Math.sin(i / 100); // Random weight with some variation
      const formattedDate = date.toISOString();
      const formattedWeight = parseFloat(weight.toFixed(1));
      mockData.push([formattedDate, formattedWeight]);
    }

    for (const [date, weight] of mockData) {
      let notes = Math.random() < 0.5 ? '' : 'Mock seed data (lean bulk)';
      await this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [weight, date, notes]);
    }
  }

  // ── Weight entries ────────────────────────────────────────────────────────

  addEntry(entry: Omit<WeightEntry, 'id'>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [
          unitToKg(entry.weight_kg, this.currentWeightUnit),
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
    const hasNotes = 'notes' in entry;
    const trimmedNotes = hasNotes ? entry.notes?.trim() || null : null;
    const weightToStore = entry.weight_kg != null ? unitToKg(entry.weight_kg, this.currentWeightUnit) : null;

    return this.whenReady(() =>
      from(
        this.db.run(
          `UPDATE weight_entries
             SET weight_kg = COALESCE(?, weight_kg),
                 logged_at = COALESCE(?, logged_at),
                 notes     = CASE WHEN ? = 1 THEN ? ELSE notes END
           WHERE id = ?`,
          [weightToStore, entry.logged_at ?? null, hasNotes ? 1 : 0, trimmedNotes, entry.id],
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
    const heightCm = settings.height_cm ?? (settings.heightFtIn ? ftInToCm(settings.heightFtIn) : null);
    return this.whenReady(() =>
      from(
        this.db.run(
          `INSERT INTO user_settings (user_id, name, age, gender, height_cm, weight_unit, height_unit)
             VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             name        = excluded.name,
             age         = excluded.age,
             gender      = excluded.gender,
             height_cm   = excluded.height_cm,
             weight_unit = excluded.weight_unit,
             height_unit = excluded.height_unit`,
          [
            settings.name ?? null,
            settings.age ?? null,
            settings.gender ?? null,
            heightCm,
            settings.weight_unit ?? 'kg',
            settings.height_unit ?? 'cm',
          ],
        ),
      ).pipe(
        switchMap(() => from(this.syncSettings())),
        switchMap(() => from(Promise.all([this.syncEntries(), this.syncGoals()]))),
        map(() => undefined),
      ),
    );
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  addGoal(goal: Omit<Goal, 'id'>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO goals (start_weight_kg, goal_weight_kg, start_date, goal_date, label) VALUES (?, ?, ?, ?, ?)`, [
          unitToKg(goal.start_weight_kg, this.currentWeightUnit),
          unitToKg(goal.goal_weight_kg, this.currentWeightUnit),
          goal.start_date,
          goal.goal_date,
          goal.label ?? null,
        ]),
      ).pipe(
        switchMap(() => from(this.syncGoals())),
        map(() => undefined),
      ),
    );
  }

  updateGoal(goal: Required<Pick<Goal, 'id'>> & Partial<Goal>): Observable<void> {
    return this.whenReady(() =>
      from(
        this.db.run(
          `UPDATE goals
             SET start_weight_kg = COALESCE(?, start_weight_kg),
                 goal_weight_kg  = COALESCE(?, goal_weight_kg),
                 start_date      = COALESCE(?, start_date),
                 goal_date       = COALESCE(?, goal_date),
                 label           = COALESCE(?, label)
           WHERE id = ?`,
          [
            goal.start_weight_kg != null ? unitToKg(goal.start_weight_kg, this.currentWeightUnit) : null,
            goal.goal_weight_kg != null ? unitToKg(goal.goal_weight_kg, this.currentWeightUnit) : null,
            goal.start_date ?? null,
            goal.goal_date ?? null,
            goal.label ?? null,
            goal.id,
          ],
        ),
      ).pipe(
        switchMap(() => from(this.syncGoals())),
        map(() => undefined),
      ),
    );
  }

  deleteGoal(id: number): Observable<void> {
    return this.whenReady(() =>
      from(this.db.run(`DELETE FROM goals WHERE id = ?`, [id])).pipe(
        switchMap(() => from(this.syncGoals())),
        map(() => undefined),
      ),
    );
  }
}
