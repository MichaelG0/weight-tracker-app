import { computed, inject, Injectable, Signal } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Observable, ReplaySubject, combineLatest, from } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { cmToFtIn, ftInToCm, unitToKgFixed, kgToUnit } from '../utils/unit-conversion.util';
import { todayLocalMidnightMs, toLocalMidnightString } from '../utils/date-converter.util';
import { toSignal } from '@angular/core/rxjs-interop';
import { MockDataService } from './mock-data.service';

// ─── Entities ──────────────────────────────────────────────────────────────────

export interface WeightEntryDB {
  id: number;
  weight_kg: number;
  logged_at: string; // ISO-8601
  notes?: string;
}

export interface GoalDB {
  id: number;
  start_weight_kg: number;
  goal_weight_kg: number;
  start_date: string; // ISO-8601
  goal_date: string; // ISO-8601
  type: GoalType;
}

export interface UserSettingsDB {
  user_id: number;
  name?: string;
  age?: number;
  gender?: string;
  height_cm?: number;
  heightFtIn?: HeightFtIn;
  weight_unit?: WeightUnit;
  height_unit?: HeightUnit;
  activity_level?: ActivityLevel;
  experience?: Experience;
  body_type?: BodyType;
}

// ─── Models ──────────────────────────────────────────────────────────────────

export type GoalType = 'Weight Gain' | 'Weight Loss' | 'Maintenance';

export type WeightUnit = 'kg' | 'lbs' | 'st';
export type HeightUnit = 'cm' | 'ft/in';
export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active';
export type Experience = 'Beginner' | 'Intermediate' | 'Advanced';
export type BodyType = 'Ectomorph' | 'Mesomorph' | 'Endomorph';

export interface HeightFtIn {
  feet: number | null;
  inches: number | null;
}

export interface WeightEntry {
  id: number;
  date: string; // ISO-8601
  dateMs: number; // local ms
  weight: number; // scale weight in user unit
  trend: number; // EWMA in user unit
  notes?: string;
}

export interface Goal {
  id: number;
  startWeight: number;
  goalWeight: number;
  startDate: string; // ISO-8601
  startDateMs: number; // local ms
  goalDate: string; // ISO-8601
  goalDateMs: number; // local ms
  type: GoalType;
}

export interface UserSettings {
  name?: string;
  age?: number;
  gender?: string;
  heightCm?: number;
  heightFtIn?: HeightFtIn;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  activityLevel?: ActivityLevel;
  experience?: Experience;
  bodyType?: BodyType;
}

export interface UserSettingsExtended extends UserSettings {
  coaching: {
    maintRangePct: number;
    scheduleToleranceWeeks: number;
    rangeCap: number;
    noiseFloor: number;
    maxLossRate: number;
    idealGainCeilingPct: number;
    deficitStep: number;
    surplusStep: number;
    minorDeficitStep: number;
    minorSurplusStep: number;
    maintMinorStep: number;
    maintMajorCut: number;
    maintMajorAdd: number;
    stepAdvice: string;
  };
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS weight_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    weight_kg  REAL NOT NULL,
    logged_at  TEXT NOT NULL UNIQUE,
    notes      TEXT
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id        INTEGER PRIMARY KEY,
    name           TEXT,
    age            INTEGER,
    gender         TEXT,
    height_cm      REAL,
    weight_unit    TEXT DEFAULT 'kg',
    height_unit    TEXT DEFAULT 'cm',
    activity_level TEXT,
    experience     TEXT,
    body_type      TEXT
  );

  CREATE TABLE IF NOT EXISTS goals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    start_weight_kg REAL NOT NULL DEFAULT 0,
    goal_weight_kg REAL NOT NULL,
    start_date     TEXT NOT NULL,
    goal_date      TEXT NOT NULL,
    type           TEXT NOT NULL
  );
`;

// ─── Constants ──────────────────────────────────────────────────────────────────

const ALPHA = 0.1;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private readonly mockData = inject(MockDataService);
  private db!: SQLiteDBConnection;

  // Emits once (and replays to late subscribers) when the DB is ready.
  // All public methods pipe through ready$ so callers never need to wait.
  private readonly ready$ = new ReplaySubject<void>(1);

  // ── Reactive collections ──────────────────────────────────────────────────
  // Subscribe in components — updated automatically after every mutation.
  // Weight values are emitted already converted to the user's preferred unit.

  private readonly _entries$ = new BehaviorSubject<WeightEntryDB[]>([]);
  private readonly _settings$ = new BehaviorSubject<UserSettingsDB | null>(null);
  private readonly _goals$ = new BehaviorSubject<GoalDB[]>([]);

  /** All entries with their computed EWMA trend value, sorted oldest → newest. */
  private readonly entries$: Observable<WeightEntry[]> = combineLatest([
    this._entries$,
    this._settings$.pipe(map(s => s?.weight_unit)),
  ]).pipe(
    map(([entriesDB, unit]) => {
      if (!entriesDB.length || !unit) return [];
      // Alphabetical string comparison is way faster and yields the exact same chronological result
      const ordered = entriesDB.sort((a, b) => a.logged_at.localeCompare(b.logged_at));

      const entries: WeightEntry[] = [];
      let ewma = kgToUnit(ordered[0].weight_kg, unit);
      let prevDateMs = +new Date(ordered[0].logged_at);

      for (let i = 0; i < ordered.length; i++) {
        const entry = ordered[i];
        const convertedWeight = kgToUnit(entry.weight_kg, unit);
        const currentDateMs = +new Date(entry.logged_at);

        if (i === 0) {
          ewma = convertedWeight;
        } else {
          const daysDelta = (currentDateMs - prevDateMs) / 86400000; // ms → days
          const adjustedAlpha = 1 - Math.pow(1 - ALPHA, daysDelta);
          ewma = ewma + adjustedAlpha * (convertedWeight - ewma);
        }

        entries.push({
          id: entry.id,
          date: entry.logged_at,
          dateMs: currentDateMs,
          weight: convertedWeight,
          trend: ewma,
          notes: entry.notes,
        });

        prevDateMs = currentDateMs;
      }

      console.log('entries$', entries.slice(-5));
      return entries;
    }),
  );
  private readonly settings$: Observable<UserSettings | null> = this._settings$.asObservable().pipe(
    map(settings => {
      if (!settings) return null;
      const converted: UserSettings = {
        name: settings.name,
        age: settings.age,
        gender: settings.gender,
        heightCm: settings.height_cm,
        heightFtIn: settings.height_cm ? cmToFtIn(settings.height_cm) : undefined,
        weightUnit: settings.weight_unit ?? 'kg',
        heightUnit: settings.height_unit ?? 'cm',
        activityLevel: settings.activity_level,
        experience: settings.experience,
        bodyType: settings.body_type,
      };

      console.log('settings$', converted);
      return converted;
    }),
  );
  private readonly goals$: Observable<Goal[]> = combineLatest([this._goals$, this._settings$.pipe(map(s => s?.weight_unit))]).pipe(
    map(([goalsDB, unit]) => {
      if (!goalsDB.length || !unit) return [];
      const goals: Goal[] = goalsDB.map(g => ({
        id: g.id,
        startWeight: kgToUnit(g.start_weight_kg, unit),
        goalWeight: kgToUnit(g.goal_weight_kg, unit),
        startDate: g.start_date,
        startDateMs: +new Date(g.start_date),
        goalDate: g.goal_date,
        goalDateMs: +new Date(g.goal_date),
        type: g.type,
      }));

      console.log('goals$', goals);
      return goals;
    }),
  );

  // ── Derived  signals ──────────────────────────────────────

  readonly entries: Signal<WeightEntry[]> = toSignal(this.entries$, { initialValue: [] });
  readonly recentEntries: Signal<WeightEntry[]> = computed(() => this.entries().slice(-7));
  readonly latestEntry: Signal<WeightEntry | null> = computed(() => {
    const pts = this.entries();
    return pts.length ? pts[pts.length - 1] : null;
  });
  readonly entriesAfterGoalStart: Signal<WeightEntry[]> = computed(() => {
    const activeGoal = this.activeGoal();
    if (!activeGoal) return [];
    return this.entries().filter(e => e.dateMs >= activeGoal.startDateMs);
  });

  readonly goals: Signal<Goal[]> = toSignal(this.goals$, { initialValue: [] });
  readonly activeGoal: Signal<Goal | null> = computed(() => {
    const goals = this.goals();
    if (!goals.length) return null;
    const today = todayLocalMidnightMs();
    return goals.find(g => g.goalDateMs >= today && g.startDateMs <= today) ?? null;
  });
  readonly activeOrLatestGoal: Signal<Goal | null> = computed(() => {
    const active = this.activeGoal();
    if (active) return active;
    const goals = this.goals();
    if (!goals.length) return null;
    const today = todayLocalMidnightMs();
    const started = goals.filter(g => g.startDateMs <= today);
    if (!started.length) return null;
    return started.reduce((latest, g) => (g.startDateMs > latest.startDateMs ? g : latest));
  });
  readonly futureGoals: Signal<Goal[]> = computed(() => {
    const today = todayLocalMidnightMs();
    return this.goals().filter(g => g.goalDateMs > today);
  });

  readonly settings: Signal<UserSettings | null> = toSignal(this.settings$, { initialValue: null });
  readonly weightUnit = computed(() => this.settings()?.weightUnit ?? 'kg');
  readonly heightUnit = computed(() => this.settings()?.heightUnit ?? 'cm');
  readonly extendedSettings: Signal<UserSettingsExtended | null> = computed(() => {
    const settings = this.settings();
    const activeGoal = this.activeGoal();
    if (!settings) return null;
    return { ...settings, coaching: this.computeCoaching(settings, activeGoal?.type ?? null) };
  });

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
      await this.mockData.seed(this.db);
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
    this._entries$.next((r.values ?? []) as WeightEntryDB[]);
  }

  private async syncSettings(): Promise<void> {
    const r = await this.db.query(`SELECT * FROM user_settings WHERE user_id = 1`);
    this._settings$.next(r.values?.[0] ?? null);
  }

  private async syncGoals(): Promise<void> {
    const r = await this.db.query(`SELECT * FROM goals ORDER BY goal_date ASC`);
    this._goals$.next((r.values ?? []) as GoalDB[]);
  }

  // ── Weight entries ────────────────────────────────────────────────────────

  addEntry(entry: Omit<WeightEntryDB, 'id'>): Observable<void> {
    console.log('Adding entry:', entry);
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [
          unitToKgFixed(entry.weight_kg, this.weightUnit()),
          toLocalMidnightString(entry.logged_at),
          entry.notes ?? null,
        ]),
      ).pipe(
        switchMap(() => from(this.syncEntries())),
        map(() => undefined),
      ),
    );
  }

  updateEntry(entry: Required<Pick<WeightEntryDB, 'id'>> & Partial<WeightEntryDB>): Observable<void> {
    console.log('Updating entry:', entry);
    const hasNotes = 'notes' in entry;
    const trimmedNotes = hasNotes ? entry.notes?.trim() || null : null;
    const weightToStore = entry.weight_kg != null ? unitToKgFixed(entry.weight_kg, this.weightUnit()) : null;

    return this.whenReady(() =>
      from(
        this.db.run(
          `UPDATE weight_entries
             SET weight_kg = COALESCE(?, weight_kg),
                 logged_at = COALESCE(?, logged_at),
                 notes     = CASE WHEN ? = 1 THEN ? ELSE notes END
           WHERE id = ?`,
          [weightToStore, entry.logged_at ? toLocalMidnightString(entry.logged_at) : null, hasNotes ? 1 : 0, trimmedNotes, entry.id],
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

  getEntry(id: number): Observable<WeightEntryDB | null> {
    return this.whenReady(() =>
      from(this.db.query(`SELECT * FROM weight_entries WHERE id = ?`, [id])).pipe(map(r => (r.values?.[0] as WeightEntryDB) ?? null)),
    );
  }

  // ── User settings ─────────────────────────────────────────────────────────

  // Upserts the single settings row (user_id = 1).
  saveSettings(settings: Omit<UserSettingsDB, 'user_id'>): Observable<void> {
    const heightCm = settings.height_cm ?? (settings.heightFtIn ? ftInToCm(settings.heightFtIn) : null);
    return this.whenReady(() =>
      from(
        this.db.run(
          `INSERT INTO user_settings (user_id, name, age, gender, height_cm, weight_unit, height_unit, activity_level, experience, body_type)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             name           = excluded.name,
             age            = excluded.age,
             gender         = excluded.gender,
             height_cm      = excluded.height_cm,
             weight_unit    = excluded.weight_unit,
             height_unit    = excluded.height_unit,
             activity_level = excluded.activity_level,
             experience     = excluded.experience,
             body_type      = excluded.body_type`,
          [
            settings.name ?? null,
            settings.age ?? null,
            settings.gender ?? null,
            heightCm,
            settings.weight_unit ?? 'kg',
            settings.height_unit ?? 'cm',
            settings.activity_level ?? null,
            settings.experience ?? null,
            settings.body_type ?? null,
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

  addGoal(goal: Omit<GoalDB, 'id'>): Observable<void> {
    console.log('Adding goal:', goal);
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO goals (start_weight_kg, goal_weight_kg, start_date, goal_date, type) VALUES (?, ?, ?, ?, ?)`, [
          unitToKgFixed(goal.start_weight_kg, this.weightUnit()),
          unitToKgFixed(goal.goal_weight_kg, this.weightUnit()),
          toLocalMidnightString(goal.start_date),
          toLocalMidnightString(goal.goal_date),
          goal.type ?? null,
        ]),
      ).pipe(
        switchMap(() => from(this.syncGoals())),
        map(() => undefined),
      ),
    );
  }

  updateGoal(goal: Required<Pick<GoalDB, 'id'>> & Partial<GoalDB>): Observable<void> {
    console.log('Updating goal:', goal);
    return this.whenReady(() =>
      from(
        this.db.run(
          `UPDATE goals
             SET start_weight_kg = COALESCE(?, start_weight_kg),
                 goal_weight_kg  = COALESCE(?, goal_weight_kg),
                 start_date      = COALESCE(?, start_date),
                 goal_date       = COALESCE(?, goal_date),
                 type            = COALESCE(?, type)
           WHERE id = ?`,
          [
            goal.start_weight_kg != null ? unitToKgFixed(goal.start_weight_kg, this.weightUnit()) : null,
            goal.goal_weight_kg != null ? unitToKgFixed(goal.goal_weight_kg, this.weightUnit()) : null,
            goal.start_date != null ? toLocalMidnightString(goal.start_date) : null,
            goal.goal_date != null ? toLocalMidnightString(goal.goal_date) : null,
            goal.type ?? null,
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

  // ── Utils ─────────────────────────────────────────────────────────

  private computeCoaching(settings: UserSettings, goalType: GoalType | null): UserSettingsExtended['coaching'] {
    const weightUnit = settings.weightUnit;
    const isFemale = settings.gender === 'Female';

    // ── Dynamic thresholds (gender × experience) ──
    let maintRangePct: number;
    let scheduleToleranceWeeks: number;
    let rangeCapKg: number;
    let noiseFloorKg: number;

    // ── Recommendation thresholds (gender × experience) ──
    let maxLossRate: number;
    let idealGainCeilingPct: number;
    let deficitStep: number;
    let surplusStep: number;
    let stepAdvice = '';

    // prettier-ignore
    if (isFemale) {
      switch (settings.experience) {
        case 'Beginner':
          maintRangePct = 2.0; scheduleToleranceWeeks = 3.0; rangeCapKg = 3.0; noiseFloorKg = 0.8;
          maxLossRate = 0.6; idealGainCeilingPct = 0.35; deficitStep = 125; surplusStep = 175;
          break;
        case 'Advanced':
          maintRangePct = 1.0; scheduleToleranceWeeks = 2.0; rangeCapKg = 2.0; noiseFloorKg = 0.5;
          maxLossRate = 0.8; idealGainCeilingPct = 0.15; deficitStep = 200; surplusStep = 200;
          break;
        default:
          maintRangePct = 1.5; scheduleToleranceWeeks = 2.5; rangeCapKg = 2.5; noiseFloorKg = 0.6;
          maxLossRate = 0.7; idealGainCeilingPct = 0.25; deficitStep = 150; surplusStep = 200;
      }
    } else {
      switch (settings.experience) {
        case 'Beginner':
          maintRangePct = 1.5; scheduleToleranceWeeks = 2.5; rangeCapKg = 2.5; noiseFloorKg = 0.6;
          maxLossRate = 0.7; idealGainCeilingPct = 0.6; deficitStep = 150; surplusStep = 200;
          break;
        case 'Advanced':
          maintRangePct = 0.75; scheduleToleranceWeeks = 1.5; rangeCapKg = 1.5; noiseFloorKg = 0.25;
          maxLossRate = 1.0; idealGainCeilingPct = 0.25; deficitStep = 250; surplusStep = 200;
          break;
        default:
          maintRangePct = 1.0; scheduleToleranceWeeks = 2.0; rangeCapKg = 2.0; noiseFloorKg = 0.5;
          maxLossRate = 1.0; idealGainCeilingPct = 0.4; deficitStep = 200; surplusStep = 200;
      }
    }

    // ── Secondary modifiers: activity, body type, age ──
    if (settings.activityLevel === 'Sedentary' || settings.activityLevel === 'Lightly Active') {
      deficitStep = Math.min(deficitStep, 150);
      surplusStep = Math.min(surplusStep, 150);
      stepAdvice = ' Focus on increasing daily movement (walking, stairs) alongside any dietary change.';
    } else if (settings.activityLevel === 'Very Active' || settings.activityLevel === 'Extra Active') {
      deficitStep = Math.max(deficitStep, 200);
      surplusStep = Math.max(surplusStep, 250);
      stepAdvice = ' With your activity level, prioritize protein and recovery.';
    }

    if (settings.bodyType === 'Endomorph') {
      maxLossRate = Math.min(maxLossRate, 0.8);
      if (goalType === 'Weight Gain') stepAdvice = ' Monitor waist measurements closely — endomorphs tend to store fat more easily.';
    } else if (settings.bodyType === 'Ectomorph') {
      if (goalType === 'Weight Gain') surplusStep = Math.max(surplusStep, 300);
      if (goalType === 'Weight Gain')
        stepAdvice = ' Ectomorphs often need a larger surplus — calorie-dense foods like nuts, oils, and shakes help.';
    }

    if (settings.age != null && settings.age >= 50) {
      maxLossRate = Math.min(maxLossRate, 0.7);
      deficitStep = Math.min(deficitStep, 150);
      stepAdvice = stepAdvice || ' Prioritize protein intake and resistance training to preserve muscle mass.';
    }

    const minorDeficitStep = Math.round(deficitStep * 0.6);
    const minorSurplusStep = Math.round(surplusStep * 0.6);
    const maintMinorStep = Math.max(100, Math.min(minorDeficitStep, 150));

    return {
      maintRangePct,
      scheduleToleranceWeeks,
      rangeCap: kgToUnit(rangeCapKg, weightUnit),
      noiseFloor: kgToUnit(noiseFloorKg, weightUnit),
      maxLossRate,
      idealGainCeilingPct,
      deficitStep,
      surplusStep,
      minorDeficitStep,
      minorSurplusStep,
      maintMinorStep,
      maintMajorCut: deficitStep,
      maintMajorAdd: surplusStep,
      stepAdvice,
    };
  }
}
