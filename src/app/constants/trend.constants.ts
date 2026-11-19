// ─── Trend calculation ─────────────────────────────────────────────────────────

/** Daily smoothing factor for the Hacker's Diet trend (exponentially smoothed moving average). */
export const TREND_ALPHA = 0.1;

// ─── Weekly rate ───────────────────────────────────────────────────────────────

/** Lookback for loss goals (fast signal). */
export const RATE_LOOKBACK_DAYS_LOSS = 21;
/** Lookback for gain/maintenance goals, whose rates are small. */
export const RATE_LOOKBACK_DAYS_STEADY = 28;
/** Upper limit when the lookback is stretched to resolve a very small target rate. */
export const RATE_LOOKBACK_DAYS_MAX = 84;

/** Floor for residual SD (kg) so a few lucky points can't claim tiny uncertainty. */
export const RATE_NOISE_FLOOR_KG = 0.3;
/** A slope must exceed this many standard errors to count as rising/falling. */
export const RATE_FLAT_SE_MULTIPLIER = 1.5;
/** Loss/gain goals: a slope beyond this (% of body weight per week) counts as rising/falling, regardless of SE. */
export const RATE_GOAL_FLAT_PCT = 0.01;
/** Rates smaller than this (% of body weight per week) are treated as flat. */
export const RATE_MIN_MEANINGFUL_PCT = 0.1;
/** Max SE (% BW/week) at which the rate magnitude is trusted. */
export const RATE_MAX_SE_PCT = 0.35;
/** Maintenance drift above this (% BW/week) counts as "fast". */
export const MAINT_FAST_DRIFT_PCT = 0.5;

/** Days since the latest entry after which the rate is considered stale. */
export const RATE_STALE_AFTER_DAYS = 6;

/** Days since the latest entry after which the rate is considered outdated. */
export const RATE_OUTDATED_AFTER_DAYS = 14;

/** Largest allowed gap between consecutive samples, as a fraction of the lookback window. */
export const RATE_MAX_GAP_FRACTION = 1 / 3;

// ─── Stability ─────────────────────────────────────────────────────────────────

/** Days of entries preferred for the stability score; if fewer than the minimum fall inside, the most recent STABILITY_WINDOW_DAYS entries are used instead. */
export const STABILITY_WINDOW_DAYS = 7;

/** Minimum number of entries in the window for a meaningful standard deviation. */
export const STABILITY_MIN_SAMPLES = 4;

/** Standard deviation in kg at which the stability score reaches zero. */
export const STABILITY_SD_THRESHOLD_KG = 1.5;

// ─── Recommendations ────────────────────────────────────────────────────────────

/** Minimum number of entries required to unlock personalized recommendations. */
export const RECOMMENDATION_MIN_ENTRIES_REQUIRED = 4;
