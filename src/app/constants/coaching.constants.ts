import type { Experience, WeightUnit } from '../services/database.service';
import { unitToKg } from '../utils/unit-conversion.util';

// ─── Experience thresholds (gender × experience) ─────────────────────────────

export interface ExperienceThresholds {
  /** Maintenance range as a percentage of goal weight. */
  maintRangePct: number;
  scheduleToleranceWeeks: number;
  /** Upper bound of the maintenance range, in kg. */
  rangeCapKg: number;
  /**
   * Lower bound of the maintenance range, in kg. Day-to-day scale noise is
   * typically 0.5–1.5 kg (more for women across the menstrual cycle), so keep
   * this at or above ~0.5 kg and compare smoothed trend weight, not raw weigh-ins.
   */
  noiseFloorKg: number;
  /** Maximum weekly loss, as a percentage of body weight. */
  maxLossRatePct: number;
  /**
   * Weekly gain bounds, as a percentage of body weight. The floor is below what a
   * scale can detect in one week, so judge gains over 3–4 weeks.
   */
  idealGainFloorPct: number;
  idealGainCeilingPct: number;
  /** Base daily calorie steps. Final steps are further limited by body weight (see computeCoaching). */
  deficitStep: number;
  surplusStep: number;
}

export const FEMALE_THRESHOLDS: Record<Experience, ExperienceThresholds> = {
  Beginner: {
    maintRangePct: 2.0,
    scheduleToleranceWeeks: 3.0,
    rangeCapKg: 3.0,
    noiseFloorKg: 0.8,
    maxLossRatePct: 1.0,
    idealGainFloorPct: 0.12,
    idealGainCeilingPct: 0.25,
    deficitStep: 150,
    surplusStep: 150,
  },
  Intermediate: {
    maintRangePct: 1.5,
    scheduleToleranceWeeks: 2.5,
    rangeCapKg: 2.5,
    noiseFloorKg: 0.7,
    maxLossRatePct: 0.8,
    idealGainFloorPct: 0.06,
    idealGainCeilingPct: 0.15,
    deficitStep: 150,
    surplusStep: 125,
  },
  Advanced: {
    maintRangePct: 1.0,
    scheduleToleranceWeeks: 2.0,
    rangeCapKg: 2.0,
    noiseFloorKg: 0.7,
    maxLossRatePct: 0.5,
    idealGainFloorPct: 0.03,
    idealGainCeilingPct: 0.1,
    deficitStep: 125,
    surplusStep: 100,
  },
};

export const MALE_THRESHOLDS: Record<Experience, ExperienceThresholds> = {
  Beginner: {
    maintRangePct: 1.5,
    scheduleToleranceWeeks: 2.5,
    rangeCapKg: 2.5,
    noiseFloorKg: 0.6,
    maxLossRatePct: 1.0,
    idealGainFloorPct: 0.2,
    idealGainCeilingPct: 0.4,
    deficitStep: 200,
    surplusStep: 200,
  },
  Intermediate: {
    maintRangePct: 1.0,
    scheduleToleranceWeeks: 2.0,
    rangeCapKg: 2.0,
    noiseFloorKg: 0.5,
    maxLossRatePct: 0.8,
    idealGainFloorPct: 0.1,
    idealGainCeilingPct: 0.25,
    deficitStep: 200,
    surplusStep: 175,
  },
  Advanced: {
    maintRangePct: 0.75,
    scheduleToleranceWeeks: 1.5,
    rangeCapKg: 1.5,
    noiseFloorKg: 0.5,
    maxLossRatePct: 0.5,
    idealGainFloorPct: 0.05,
    idealGainCeilingPct: 0.15,
    deficitStep: 150,
    surplusStep: 150,
  },
};

// ─── Activity modifiers ──────────────────────────────────────────────────────

/** Maximum calorie step for Sedentary and Lightly Active users. */
export const LOW_ACTIVITY_STEP_CAP = 150;
/** Minimum deficit step for Very Active and Extra Active users. */
export const HIGH_ACTIVITY_DEFICIT_STEP_MIN = 200;
/** Minimum surplus step for Very Active and Extra Active users. */
export const HIGH_ACTIVITY_SURPLUS_STEP_MIN = 250;

// ─── Age modifiers ───────────────────────────────────────────────────────────

export const SENIOR_AGE = 65;
export const SENIOR_MAX_LOSS_RATE_PCT = 0.5;
export const SENIOR_DEFICIT_STEP_CAP = 150;

// ─── Rate limits → calories ──────────────────────────────────────────────────

/**
 * Approximate energy per kg of body-mass change. This is the fat figure, so it
 * slightly overstates the cost of muscle gain, which keeps the limits conservative.
 */
export const ENERGY_PER_KG_KCAL = 7700;
/** A calorie step is never reduced below this, even for light users. */
export const MIN_STEP_KCAL = 50;

/** Daily calorie change that produces a weekly body-weight change of `pct` percent. */
export function weeklyPctToDailyKcal(pct: number, weight: number, weightUnit: WeightUnit): number {
  const weightKg = unitToKg(weight, weightUnit);
  return Math.round(((pct / 100) * weightKg * ENERGY_PER_KG_KCAL) / 7);
}

// ─── Calories → daily steps ──────────────────────────────────────────────────

/** Average walking stride, in metres. */
export const STRIDE_M = 0.75;
/** Net energy cost of level walking above resting, in kcal per kg per metre (≈0.5 kcal/kg/km). */
export const NET_WALK_KCAL_PER_KG_PER_M = 0.0005;
/** Realistic bounds for an extra-steps suggestion. */
export const MIN_EXTRA_STEPS = 1000;
export const MAX_EXTRA_STEPS = 4000;

/**
 * Extra daily steps needed to burn roughly `kcal` for a person of `weightKg`,
 * rounded to the nearest 500 and clamped to a believable range.
 */
export function kcalToSteps(kcal: number, weight: number, weightUnit: WeightUnit): number {
  const weightKg = unitToKg(weight, weightUnit);
  const kcalPerStep = NET_WALK_KCAL_PER_KG_PER_M * weightKg * STRIDE_M;
  const steps = Math.round(kcal / kcalPerStep / 500) * 500;
  return Math.min(MAX_EXTRA_STEPS, Math.max(MIN_EXTRA_STEPS, steps));
}

// ─── Derived steps and floors ────────────────────────────────────────────────

/** Minor steps are this fraction of the major step. */
export const MINOR_STEP_RATIO = 0.6;
export const MAINT_MINOR_STEP_MIN = 100;
export const MAINT_MINOR_STEP_MAX = 150;
/** Loss floors as fractions of the maximum loss rate. */
export const IDEAL_LOSS_FLOOR_RATIO = 0.5;
export const STEADY_LOSS_FLOOR_RATIO = 0.25;
