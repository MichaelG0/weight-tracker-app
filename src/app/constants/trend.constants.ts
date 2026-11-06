// ─── Trend calculation ─────────────────────────────────────────────────────────

/** Daily smoothing factor for the Hacker's Diet trend (exponentially smoothed moving average). */
export const TREND_ALPHA = 0.1;

// ─── Weekly rate ───────────────────────────────────────────────────────────────

/** Days of entries (ending at the latest entry) used to fit the weekly rate slope. */
export const WEEKLY_RATE_LOOKBACK_DAYS = 14;

/** Days since the latest entry after which the rate is considered stale. */
export const RATE_STALE_AFTER_DAYS = 6;

/** Minimum number of samples for a meaningful fit. */
export const RATE_MIN_SAMPLES = 4;

// ─── Stability ─────────────────────────────────────────────────────────────────

/** Days of entries used for the stability score. */
export const STABILITY_WINDOW_DAYS = 7;

/** Standard deviation in kg at which the stability score reaches zero. */
export const STABILITY_SD_THRESHOLD_KG = 1.5;
