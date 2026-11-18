// ─── Trend calculation ─────────────────────────────────────────────────────────

/** Daily smoothing factor for the Hacker's Diet trend (exponentially smoothed moving average). */
export const TREND_ALPHA = 0.1;

// ─── Weekly rate ───────────────────────────────────────────────────────────────

/** Days of entries (ending at the latest entry) used to fit the weekly rate slope. */
export const WEEKLY_RATE_LOOKBACK_DAYS = 21;

/** Days since the latest entry after which the rate is considered stale. */
export const RATE_STALE_AFTER_DAYS = 6;

/** Days since the latest entry after which the rate is considered outdated. */
export const RATE_OUTDATED_AFTER_DAYS = 14;

/** Minimum samples per week of lookback window for a meaningful fit (2/week → 6 samples over 21 days). */
export const RATE_MIN_SAMPLES_PER_WEEK = 2;

/** Minimum span of samples, as a fraction of the lookback window (minus 1 day tolerance). */
export const RATE_MIN_SPAN_FRACTION = 1 / 2;

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
