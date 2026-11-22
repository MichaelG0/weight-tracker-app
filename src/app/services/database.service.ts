import { computed, inject, Injectable, Signal } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, Observable, ReplaySubject, combineLatest, from, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { cmToFtIn, ftInToCm, unitToKg, kgToUnit } from '../utils/unit-conversion.util';
import { dateKeyToDayNumber, toDateKey, todayLocalMidnightMs, toLocalMidnightString } from '../utils/date-converter.util';
import { toSignal } from '@angular/core/rxjs-interop';
import { MockDataService } from './mock-data.service';
import { ageFromBirthDate } from '../utils/age-calculator.util';
import { TREND_ALPHA } from '../constants/trend.constants';
import {
  FEMALE_THRESHOLDS,
  MALE_THRESHOLDS,
  LOW_ACTIVITY_STEP_CAP,
  HIGH_ACTIVITY_DEFICIT_STEP_MIN,
  HIGH_ACTIVITY_SURPLUS_STEP_MIN,
  SENIOR_AGE,
  SENIOR_MAX_LOSS_RATE_PCT,
  SENIOR_DEFICIT_STEP_CAP,
  MINOR_STEP_RATIO,
  MAINT_MINOR_STEP_MIN,
  MAINT_MINOR_STEP_MAX,
  IDEAL_LOSS_FLOOR_RATIO,
  STEADY_LOSS_FLOOR_RATIO,
  MIN_STEP_KCAL,
  weeklyPctToDailyKcal,
} from '../constants/coaching.constants';
import { LogService } from './log.service';

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
  birth_date?: string; // YYYY-MM-DD
  gender?: string;
  height_cm?: number;
  heightFtIn?: HeightFtIn;
  weight_unit?: WeightUnit;
  height_unit?: HeightUnit;
  activity_level?: ActivityLevel;
  experience?: Experience;
}

// ─── Models ──────────────────────────────────────────────────────────────────

export type GoalType = 'Weight Gain' | 'Weight Loss' | 'Maintenance';

export type WeightUnit = 'kg' | 'lbs' | 'st';
export type HeightUnit = 'cm' | 'ft/in';
export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active';
export type Experience = 'Beginner' | 'Intermediate' | 'Advanced';

export interface WeightPart {
  value: string;
  unit: string;
}

export interface WeightDisplay {
  parts: WeightPart[];
  text: string;
}

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
  birthDate?: string; // YYYY-MM-DD
  gender?: string;
  heightCm?: number;
  heightFtIn?: HeightFtIn;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  activityLevel?: ActivityLevel;
  experience?: Experience;
}

export interface UserSettingsExtended extends UserSettings {
  coaching: {
    maintRangePct: number;
    maintRange: number;
    scheduleToleranceWeeks: number;
    rangeCap: number;
    noiseFloor: number;
    idealLossFloorPct: number;
    steadyLossFloorPct: number;
    maxLossRate: number;
    idealGainFloorPct: number;
    idealGainCeilingPct: number;
    deficitStep: number;
    surplusStep: number;
    minorDeficitStep: number;
    minorSurplusStep: number;
    maintMinorStep: number;
    maintMajorCut: number;
    maintMajorAdd: number;
    customAdvice: string;
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
    birth_date     TEXT,
    gender         TEXT,
    height_cm      REAL,
    weight_unit    TEXT DEFAULT 'kg',
    height_unit    TEXT DEFAULT 'cm',
    activity_level TEXT,
    experience     TEXT
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

// Dev only: drops every table so the schema is recreated and reseeded on each start.
const DROP_TABLES = `
  DROP TABLE IF EXISTS weight_entries;
  DROP TABLE IF EXISTS user_settings;
  DROP TABLE IF EXISTS goals;
`;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private readonly logger = inject(LogService);
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
      const sortedEntriesDB = [...entriesDB].sort((a, b) => a.logged_at.localeCompare(b.logged_at));

      const entries: WeightEntry[] = [];
      let ewma = 0;
      let prevDay = dateKeyToDayNumber(sortedEntriesDB[0].logged_at);

      for (let i = 0; i < sortedEntriesDB.length; i++) {
        const entry = sortedEntriesDB[i];
        const convertedWeight = kgToUnit(entry.weight_kg, unit);
        const currentDay = dateKeyToDayNumber(entry.logged_at);

        if (i === 0) {
          ewma = convertedWeight;
        } else {
          const daysDelta = currentDay - prevDay;
          const adjustedAlpha = 1 - Math.pow(1 - TREND_ALPHA, daysDelta);
          ewma = ewma + adjustedAlpha * (convertedWeight - ewma);
        }

        entries.push({
          id: entry.id,
          date: entry.logged_at,
          dateMs: +new Date(entry.logged_at),
          weight: convertedWeight,
          trend: ewma,
          notes: entry.notes,
        });

        prevDay = currentDay;
      }

      this.logger.debug('entries$', entries.slice(-5));
      return entries;
    }),
  );
  private readonly settings$: Observable<UserSettings | null> = this._settings$.asObservable().pipe(
    map(settings => {
      if (!settings) return null;
      const converted: UserSettings = {
        name: settings.name,
        birthDate: settings.birth_date,
        gender: settings.gender,
        heightCm: settings.height_cm,
        heightFtIn: settings.height_cm ? cmToFtIn(settings.height_cm) : undefined,
        weightUnit: settings.weight_unit ?? 'kg',
        heightUnit: settings.height_unit ?? 'cm',
        activityLevel: settings.activity_level,
        experience: settings.experience,
      };

      this.logger.debug('settings$', converted);
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

      this.logger.debug('goals$', goals);
      return goals;
    }),
  );

  // ── Derived  signals ──────────────────────────────────────

  readonly entries: Signal<WeightEntry[]> = toSignal(this.entries$, { initialValue: [] });
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
  readonly activeOrLastPastGoal: Signal<Goal | null> = computed(() => {
    const active = this.activeGoal();
    if (active) return active;
    const goals = this.goals();
    if (!goals.length) return null;
    const today = todayLocalMidnightMs();
    const started = goals.filter(g => g.startDateMs <= today);
    if (!started.length) return null;
    return started.reduce((latest, g) => (g.startDateMs > latest.startDateMs ? g : latest));
  });

  readonly settings: Signal<UserSettings | null> = toSignal(this.settings$, { initialValue: null });
  readonly weightUnit = computed(() => this.settings()?.weightUnit ?? 'kg');
  readonly heightUnit = computed(() => this.settings()?.heightUnit ?? 'cm');
  readonly extendedSettings: Signal<UserSettingsExtended | null> = computed(() => {
    const settings = this.settings();
    const activeGoal = this.activeGoal();
    const trendWeight = this.latestEntry()?.trend;
    if (!settings) return null;
    return { ...settings, coaching: this.computeCoaching(settings, activeGoal, trendWeight) };
  });

  // ── Init (called from provideAppInitializer in main.ts) ───────────────────

  async initializePlugin(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      await customElements.whenDefined('jeep-sqlite');
      await this.sqlite.initWebStore();
    }

    this.db = await this.sqlite.createConnection('weight_tracker', false, 'no-encryption', 1, false);
    await this.db.open();

    if (!environment.production) {
      await this.db.execute(DROP_TABLES);
    }

    await this.db.execute(MIGRATIONS);
    await this.ensureDefaultSettings();

    if (!environment.production) {
      // await this.mockData.seed(this.db);
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

  // The entry and goal streams wait for a weight_unit, so the settings row must always exist.
  private async ensureDefaultSettings(): Promise<void> {
    await this.db.run(`INSERT OR IGNORE INTO user_settings (user_id, weight_unit) VALUES (1, 'kg')`);
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
    this.logger.info('Adding entry:', entry);
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO weight_entries (weight_kg, logged_at, notes) VALUES (?, ?, ?)`, [
          unitToKg(entry.weight_kg, this.weightUnit()),
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
    this.logger.info('Updating entry:', entry);
    const hasNotes = 'notes' in entry;
    const trimmedNotes = hasNotes ? entry.notes?.trim() || null : null;
    const weightToStore = entry.weight_kg != null ? unitToKg(entry.weight_kg, this.weightUnit()) : null;

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

  // ── Weight entries - DERIVED ────────────────────────────────────────────────────────

  /** Trend of the most recent entry on or before `date` (YYYY-MM-DD), or null if there is none. */
  trendOnOrBefore(date: string): number | null {
    const entries = this.entries();
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].date.substring(0, 10) <= date) return entries[i].trend;
    }
    return null;
  }

  // ── User settings ─────────────────────────────────────────────────────────

  // Upserts the single settings row (user_id = 1).
  saveSettings(settings: Omit<UserSettingsDB, 'user_id'>): Observable<void> {
    const heightCm = settings.height_cm ?? (settings.heightFtIn ? ftInToCm(settings.heightFtIn) : null);
    return this.whenReady(() =>
      from(
        this.db.run(
          `INSERT INTO user_settings (user_id, name, birth_date, gender, height_cm, weight_unit, height_unit, activity_level, experience)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             name           = excluded.name,
             birth_date     = excluded.birth_date,
             gender         = excluded.gender,
             height_cm      = excluded.height_cm,
             weight_unit    = excluded.weight_unit,
             height_unit    = excluded.height_unit,
             activity_level = excluded.activity_level,
             experience     = excluded.experience`,
          [
            settings.name ?? null,
            settings.birth_date ?? null,
            settings.gender ?? null,
            heightCm,
            settings.weight_unit ?? 'kg',
            settings.height_unit ?? 'cm',
            settings.activity_level ?? null,
            settings.experience ?? null,
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
    this.logger.info('Adding goal:', goal);
    return this.whenReady(() =>
      from(
        this.db.run(`INSERT INTO goals (start_weight_kg, goal_weight_kg, start_date, goal_date, type) VALUES (?, ?, ?, ?, ?)`, [
          unitToKg(goal.start_weight_kg, this.weightUnit()),
          unitToKg(goal.goal_weight_kg, this.weightUnit()),
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
    this.logger.info('Updating goal:', goal);
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
            goal.start_weight_kg != null ? unitToKg(goal.start_weight_kg, this.weightUnit()) : null,
            goal.goal_weight_kg != null ? unitToKg(goal.goal_weight_kg, this.weightUnit()) : null,
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

  /**
   * Cuts existing goals so none overlap [startDate, endDate]. Goals fully inside the range are deleted,
   * goals spanning the whole range are split in two, and partially overlapping goals are shortened.
   */
  trimOverlappingGoals(rawStartDate: string, rawEndDate: string, excludeId?: number): Observable<void> {
    this.logger.info('Trimming overlapping goals:', { startDate: rawStartDate, endDate: rawEndDate, excludeId });

    return this.whenReady(() => {
      const startDate = toDateKey(rawStartDate);
      const endDate = toDateKey(rawEndDate);

      const statements: { statement: string; values: unknown[] }[] = [];

      for (const g of this._goals$.value) {
        if (g.id === excludeId) continue;
        const gStart = g.start_date.substring(0, 10);
        const gEnd = g.goal_date.substring(0, 10);
        if (!(startDate < gEnd && endDate > gStart)) continue;

        // Weight on the original line at a given date, so trimmed goals keep the same weekly rate
        const totalDays = dateKeyToDayNumber(gEnd) - dateKeyToDayNumber(gStart);
        const weightAt = (date: string): number => {
          if (totalDays <= 0) return g.start_weight_kg;
          const fraction = (dateKeyToDayNumber(date) - dateKeyToDayNumber(gStart)) / totalDays;
          return g.start_weight_kg + (g.goal_weight_kg - g.start_weight_kg) * fraction;
        };

        if (gStart >= startDate && gEnd <= endDate) {
          this.logger.info('Deleting goal fully inside the range:', g);
          statements.push({ statement: `DELETE FROM goals WHERE id = ?`, values: [g.id] });
        } else if (gStart < startDate && gEnd > endDate) {
          this.logger.info('Splitting goal spanning the whole range:', g);
          statements.push({
            statement: `INSERT INTO goals (start_weight_kg, goal_weight_kg, start_date, goal_date, type) VALUES (?, ?, ?, ?, ?)`,
            values: [weightAt(endDate), g.goal_weight_kg, toLocalMidnightString(endDate), g.goal_date, g.type],
          });
          statements.push({
            statement: `UPDATE goals SET goal_date = ?, goal_weight_kg = ? WHERE id = ?`,
            values: [toLocalMidnightString(startDate), weightAt(startDate), g.id],
          });
        } else if (gStart < startDate) {
          this.logger.info('Trimming goal ending after the start of the range:', g);
          statements.push({
            statement: `UPDATE goals SET goal_date = ?, goal_weight_kg = ? WHERE id = ?`,
            values: [toLocalMidnightString(startDate), weightAt(startDate), g.id],
          });
        } else {
          this.logger.info('Trimming goal starting before the end of the range:', g);
          statements.push({
            statement: `UPDATE goals SET start_date = ?, start_weight_kg = ? WHERE id = ?`,
            values: [toLocalMidnightString(endDate), weightAt(endDate), g.id],
          });
        }
      }

      if (!statements.length) return of(undefined);

      return from(this.db.executeSet(statements, true)).pipe(
        switchMap(() => from(this.syncGoals())),
        map(() => undefined),
      );
    });
  }

  // ── Utils ─────────────────────────────────────────────────────────

  /**
   * @param trendWeight Current trend weight in user weight unit. When provided, calorie
   *   steps are limited so a single step can't push weekly change past the gain
   *   ceiling or the max loss rate for this person. When null, base steps are used.
   */
  private computeCoaching(
    settings: UserSettings,
    activeGoal: Goal | null = null,
    trendWeight: number | null = null,
  ): UserSettingsExtended['coaching'] {
    const weightUnit = settings.weightUnit;
    const isFemale = settings.gender === 'Female';
    const level: Experience =
      settings.experience === 'Beginner' || settings.experience === 'Advanced' ? settings.experience : 'Intermediate';
    const thresholds = (isFemale ? FEMALE_THRESHOLDS : MALE_THRESHOLDS)[level];

    const { maintRangePct, scheduleToleranceWeeks, rangeCapKg, noiseFloorKg, idealGainFloorPct, idealGainCeilingPct } = thresholds;
    let maxLossRate = thresholds.maxLossRatePct;
    let deficitStep = thresholds.deficitStep;
    let surplusStep = thresholds.surplusStep;
    let customAdvice = '';

    // ── Secondary modifiers: activity, age ──
    if (settings.activityLevel === 'Sedentary' || settings.activityLevel === 'Lightly Active') {
      deficitStep = Math.min(deficitStep, LOW_ACTIVITY_STEP_CAP);
      surplusStep = Math.min(surplusStep, LOW_ACTIVITY_STEP_CAP);
      customAdvice = ' Focus on increasing daily movement (walking, stairs) alongside any dietary change.';
    } else if (settings.activityLevel === 'Very Active' || settings.activityLevel === 'Extra Active') {
      deficitStep = Math.max(deficitStep, HIGH_ACTIVITY_DEFICIT_STEP_MIN);
      surplusStep = Math.max(surplusStep, HIGH_ACTIVITY_SURPLUS_STEP_MIN);
      customAdvice = ' With your activity level, prioritize protein and recovery.';
    }

    const age = ageFromBirthDate(settings.birthDate);
    if (age != null && age >= SENIOR_AGE) {
      maxLossRate = Math.min(maxLossRate, SENIOR_MAX_LOSS_RATE_PCT);
      deficitStep = Math.min(deficitStep, SENIOR_DEFICIT_STEP_CAP);
      customAdvice = customAdvice || ' Prioritize protein intake and resistance training to preserve muscle mass.';
    }

    // ── Rate limits: a single step must not exceed the weekly limits for this body weight ──
    // Applied last so the activity minimums can't push steps past what the limits allow.
    if (trendWeight != null && trendWeight > 0) {
      const surplusLimit = weeklyPctToDailyKcal(idealGainCeilingPct, trendWeight, weightUnit);
      const deficitLimit = weeklyPctToDailyKcal(maxLossRate, trendWeight, weightUnit);
      surplusStep = Math.max(MIN_STEP_KCAL, Math.min(surplusStep, surplusLimit));
      deficitStep = Math.max(MIN_STEP_KCAL, Math.min(deficitStep, deficitLimit));
    }

    const minorDeficitStep = Math.round(deficitStep * MINOR_STEP_RATIO);
    const minorSurplusStep = Math.round(surplusStep * MINOR_STEP_RATIO);
    const maintMinorStep = Math.max(MAINT_MINOR_STEP_MIN, Math.min(minorDeficitStep, MAINT_MINOR_STEP_MAX));

    const rangeCap = kgToUnit(rangeCapKg, weightUnit);
    const noiseFloor = kgToUnit(noiseFloorKg, weightUnit);
    const goalWeight = activeGoal?.goalWeight;
    const maintRange = goalWeight ? Math.min(Math.max(goalWeight * (maintRangePct / 100), noiseFloor), rangeCap) : 0;

    return {
      maintRangePct,
      maintRange,
      scheduleToleranceWeeks,
      rangeCap,
      noiseFloor,
      maxLossRate,
      idealLossFloorPct: maxLossRate * IDEAL_LOSS_FLOOR_RATIO,
      steadyLossFloorPct: maxLossRate * STEADY_LOSS_FLOOR_RATIO,
      idealGainFloorPct,
      idealGainCeilingPct,
      deficitStep,
      surplusStep,
      minorDeficitStep,
      minorSurplusStep,
      maintMinorStep,
      maintMajorCut: deficitStep,
      maintMajorAdd: surplusStep,
      customAdvice,
    };
  }
}
