import type { GoalType } from '../services/database.service';
import {
  RATE_FLAT_SE_MULTIPLIER,
  RATE_LOOKBACK_DAYS_LOSS,
  RATE_LOOKBACK_DAYS_MAX,
  RATE_LOOKBACK_DAYS_STEADY,
  RATE_MAX_SE_PCT,
  RATE_MIN_MEANINGFUL_PCT,
} from '../constants/trend.constants';

const MS_PER_DAY = 86_400_000;

export interface RateSample {
  dateMs: number;
  /** Scale weight, in the same unit as `noiseFloor` passed to estimateWeeklyRate. */
  weight: number;
}

export interface RateEstimate {
  /** OLS slope, units per week (negative = losing). */
  rate: number;
  /** Standard error of the slope, units per week. */
  se: number;
  nOfSamples: number;
  spanDays: number;
  maxGapDays: number;
}

/**
 * rising / falling : slope is beyond the threshold (SE-based, or a fixed % when one is given)
 * flat             : slope is not beyond the threshold
 */
export type RateState = 'rising' | 'flat' | 'falling';

export interface RateAssessment {
  state: RateState;
  /** Signed weekly rate as a percentage of trend weight. */
  pctPerWeek: number;
  /** Standard error as a percentage of trend weight per week. */
  sePct: number;
  /** True when the standard error is small enough to act on the magnitude of the rate. */
  precise: boolean;
  /** True when the slope is not distinguishable from zero (SE test) and the estimate is too noisy to call it flat. */
  inconclusive: boolean;
}

/**
 * Lookback window: short for loss (fast signal), longer for gain/maintenance (small rates).
 * When `resolvePct` (the smallest rate that should be detectable, % BW/week) is given, the window is stretched
 * until daily logging could resolve it: SE per week = 7·σ·√12 / L^1.5 for L daily samples.
 */
export function rateLookbackDays(
  goalType: GoalType | null,
  resolvePct: number | null = null,
  trendWeight: number | null = null,
  noiseFloor = 0,
): number {
  const base = goalType === 'Weight Gain' || goalType === 'Maintenance' ? RATE_LOOKBACK_DAYS_STEADY : RATE_LOOKBACK_DAYS_LOSS;
  if (!resolvePct || resolvePct <= 0 || !trendWeight || trendWeight <= 0 || noiseFloor <= 0) return base;
  const targetSe = (resolvePct / RATE_FLAT_SE_MULTIPLIER / 100) * trendWeight;
  const days = Math.ceil((7 * Math.sqrt(12) * noiseFloor / targetSe) ** (2 / 3));
  return Math.min(RATE_LOOKBACK_DAYS_MAX, Math.max(base, days));
}

/**
 * OLS fit of weight against time, anchored at the latest sample.
 * The residual SD is floored at `noiseFloor` so a handful of lucky points
 * cannot claim tiny uncertainty.
 */
export function estimateWeeklyRate(samples: RateSample[], noiseFloor: number): RateEstimate | null {
  const n = samples.length;
  if (n < 2) return null;

  const sorted = [...samples].sort((a, b) => a.dateMs - b.dateMs);
  const latestMs = sorted[n - 1].dateMs;
  const xs = sorted.map(s => (s.dateMs - latestMs) / MS_PER_DAY);
  const ys = sorted.map(s => s.weight);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const sxx = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  if (sxx === 0) return null;

  const sxy = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const slopePerDay = sxy / sxx;

  const sse = xs.reduce((s, x, i) => s + (ys[i] - (meanY + slopePerDay * (x - meanX))) ** 2, 0);
  const sigma = Math.max(Math.sqrt(sse / Math.max(n - 2, 1)), noiseFloor);

  let maxGapDays = 0;
  for (let i = 1; i < n; i++) maxGapDays = Math.max(maxGapDays, xs[i] - xs[i - 1]);

  return {
    rate: slopePerDay * 7,
    se: (sigma / Math.sqrt(sxx)) * 7,
    nOfSamples: n,
    spanDays: xs[n - 1] - xs[0],
    maxGapDays,
  };
}

export function assessRate(
  est: RateEstimate | null,
  trendWeight: number | null,
  flatMultiplier = RATE_FLAT_SE_MULTIPLIER,
  maxSePct = RATE_MAX_SE_PCT,
  minMeaningfulPct = RATE_MIN_MEANINGFUL_PCT,
  fixedThresholdPct: number | null = null,
): RateAssessment | null {
  if (!est || trendWeight == null || trendWeight <= 0) return null;

  const pctPerWeek = (est.rate / trendWeight) * 100;
  const sePct = (est.se / trendWeight) * 100;
  const precise = sePct <= maxSePct;
  // With a fixed threshold the SE test only feeds `inconclusive`; it no longer decides the state.
  const distinguishable = Math.abs(est.rate) >= flatMultiplier * est.se && Math.abs(pctPerWeek) >= minMeaningfulPct;
  const inconclusive = !distinguishable && !precise;
  const moving = fixedThresholdPct != null ? Math.abs(pctPerWeek) >= fixedThresholdPct : distinguishable;

  const state: RateState = moving ? (est.rate > 0 ? 'rising' : 'falling') : 'flat';
  return { state, pctPerWeek, sePct, precise, inconclusive };
}
