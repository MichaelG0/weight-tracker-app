import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonCard,
  IonCardContent,
  IonBadge,
  IonProgressBar,
  IonButton,
  IonGrid,
  IonRow,
  IonCol,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trendingDownOutline } from 'ionicons/icons';
import { DatabaseService, Goal, GoalType, WeightEntry, WeightUnit, ActivityLevel, Experience, BodyType, UserSettingsDB } from 'src/app/services/database.service';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { kgToUnitFixed, formatWeight, kgToUnit } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightMs, todayLocalMidnightDate } from 'src/app/utils/date-converter.util';

interface UserProfile {
  gender: string | null;
  age: number | null;
  activityLevel: ActivityLevel | null;
  experience: Experience | null;
  bodyType: BodyType | null;
}

interface DashboardVm {
  trendToFixed: string | null;
  goalWeight: string | null;
  startWeight: number | null;
  goalType: GoalType;
  maintRange: number | null;
  maintOffset: number | null;
  maintPercent: number | null;
  progressPercent: number | null;
  bwPercentPerWeek: string | null;
  absoluteRatePerWeek: string | null;
  remaining: string | null;
  totalProgress: string | null;
  expectedGoalDate: string | null;
  daysToGoal: string | null;
  daysMaintained: number | null;
  stabilityLabel: string | null;
  consistency: string;
  recommendation: string;
  rateLabel: string;
  recentEntries: Array<{ label: string; weight: string }>;
  unitLabel: string;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: 'dashboard.page.html',
  styleUrls: ['dashboard.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonCard,
    IonCardContent,
    IonBadge,
    IonProgressBar,
    IonButton,
    IonGrid,
    IonRow,
    IonCol,
    GlassHeaderBackdropDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  private readonly databaseService = inject(DatabaseService);
  private readonly modalCtrl = inject(ModalController);

  readonly statFlip = signal<[boolean, boolean, boolean]>([false, false, false]);

  readonly vm: Signal<DashboardVm> = computed(() => {
    const entries = this.databaseService.recentEntries();
    const reversed = [...entries].reverse();
    const goals = this.databaseService.goals();
    const weightUnit = this.databaseService.weightUnit();

    const latestEntry = this.databaseService.latestEntry();
    const rawTrend = latestEntry?.trend ?? null;
    const activeGoal = this.findActiveGoal(goals);
    const startWeight = activeGoal?.startWeight ?? null;
    const goalWeight = activeGoal?.goalWeight ?? null;
    const goalType = activeGoal?.type ?? 'Weight Loss';
    const weeklyRate = this.weeklyRate(latestEntry, entries);
    const stabilityScore = goalType === 'Maintenance' ? this.stabilityScore(reversed, weightUnit) : null;
    const settings = this.databaseService.settings();
    const profile: UserProfile = {
      gender: settings?.gender ?? null,
      age: settings?.age ?? null,
      activityLevel: settings?.activity_level ?? null,
      experience: settings?.experience ?? null,
      bodyType: settings?.body_type ?? null,
    };

    let maintRange: number | null = null;
    let maintOffset: number | null = null;
    let maintPercent: number | null = null;

    if (goalType === 'Maintenance' && rawTrend !== null && goalWeight !== null) {
      maintRange = kgToUnitFixed(0.907186, weightUnit);
      maintOffset = parseFloat(formatWeight(rawTrend - goalWeight, weightUnit));
      // Map [maintRange, -maintRange] to [0%, 100%]
      maintPercent = Math.max(0, Math.min(100, ((maintOffset + maintRange) / (2 * maintRange)) * 100));
    }


    return {
      trendToFixed: rawTrend !== null ? formatWeight(rawTrend, weightUnit) : null,
      goalWeight: formatWeight(goalWeight ?? 0, weightUnit),
      startWeight,
      goalType,
      maintRange,
      maintOffset,
      maintPercent,
      progressPercent: this.progressPercent(startWeight, rawTrend, goalWeight),
      bwPercentPerWeek: this.bwPercentPerWeek(rawTrend, weeklyRate),
      absoluteRatePerWeek: this.absoluteRatePerWeek(weeklyRate, weightUnit),
      remaining: this.remaining(rawTrend, goalWeight, weightUnit),
      totalProgress: this.totalProgress(startWeight, rawTrend, weightUnit),
      expectedGoalDate: this.expectedGoalDate(rawTrend, goalWeight, weeklyRate),
      daysToGoal: this.daysToGoal(rawTrend, goalWeight, weeklyRate),
      daysMaintained: goalType === 'Maintenance' ? this.daysMaintained(entries, activeGoal, maintRange) : null,
      stabilityLabel: this.stabilityLabel(stabilityScore),
      consistency: this.consistencyLabel(reversed),
      recommendation: this.recommendation(rawTrend, weeklyRate, goalType, goalWeight, stabilityScore, profile),
      rateLabel: this.rateLabel(weeklyRate, weightUnit),
      recentEntries: this.recentEntries(reversed),
      unitLabel: weightUnit,
    };
  });

  constructor() {
    addIcons({ trendingDownOutline });
  }

  async openLogWeight(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: LogWeightModalComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });

    await modal.present();
  }

  toggleStat(index: 0 | 1 | 2): void {
    const current = this.statFlip();
    const updated = [...current] as [boolean, boolean, boolean];
    updated[index] = !updated[index];
    this.statFlip.set(updated);
  }

  private recentEntries(entries: WeightEntry[]): Array<{ label: string; weight: string }> {
    return entries.slice(0, 3).map(entry => ({
      label: this.entryLabel(entry.dateMs),
      weight: formatWeight(entry.weight, this.databaseService.weightUnit()),
    }));
  }

  private entryLabel(dateMs: number): string {
    const today = todayLocalMidnightMs();

    if (dateMs >= today) {
      return 'Today';
    } else if (dateMs >= today - 86400000) {
      return 'Yesterday';
    }

    return new Date(dateMs).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }

  private bwPercentPerWeek(trendWeight: number | null, weeklyRate: number | null): string | null {
    if (trendWeight == null || weeklyRate == null || Math.abs(trendWeight) < 0.01) return null;
    const pct = (weeklyRate / trendWeight) * 100;
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  }

  private absoluteRatePerWeek(weeklyRate: number | null, weightUnit: WeightUnit): string | null {
    if (weeklyRate == null) return null;
    const sign = weeklyRate > 0 ? '+' : '';
    const fixed = weightUnit === 'st' ? 3 : 2;
    return `${sign}${weeklyRate.toFixed(fixed)}`;
  }

  private remaining(trendWeight: number | null, goalWeight: number | null, unitLabel: WeightUnit): string | null {
    if (trendWeight == null || goalWeight == null) return null;
    const diff = Math.abs(goalWeight - trendWeight);
    return diff < 0.01 ? '0' : String(formatWeight(diff, unitLabel));
  }

  private totalProgress(startWeight: number | null, trendWeight: number | null, unitLabel: WeightUnit): string | null {
    if (startWeight == null || trendWeight == null) return null;
    const diff = trendWeight - startWeight;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${formatWeight(diff, unitLabel)}`;
  }

  private daysToGoal(trendWeight: number | null, goalWeight: number | null, weeklyRate: number | null): string | null {
    if (trendWeight == null || goalWeight == null || weeklyRate == null) return null;
    const remaining = goalWeight - trendWeight;
    if (Math.abs(remaining) < 0.01) return '0';
    if (Math.abs(weeklyRate) < 0.01) return 'Stalled';
    if (Math.sign(remaining) !== Math.sign(weeklyRate)) return 'Off track';
    const weeks = Math.abs(remaining / weeklyRate);
    return `${Math.ceil(weeks * 7)} days`;
  }

  private weeklyRate(latestEntry: WeightEntry | null, entries: WeightEntry[]): number | null {
    if (latestEntry == null || entries.length < 2) return null;
    const latestMs = latestEntry.dateMs;
    const targetMs = latestMs - 7 * 86400000;

    // Find the entry closest to 7 days before the latest entry, excluding the latest itself
    const candidates = entries.filter(e => e.dateMs < latestMs);
    if (!candidates.length) return null;

    const closest = candidates.reduce((best, e) => (Math.abs(e.dateMs - targetMs) < Math.abs(best.dateMs - targetMs) ? e : best));
    const daysBetween = (latestMs - closest.dateMs) / 86400000;
    if (daysBetween < 1) return null;

    console.log('Calculating weekly rate: latest: ', latestEntry, 'closest: ', closest, 'daysBetween: ', daysBetween);
    const weeklyRate = ((latestEntry.trend - closest.trend) / daysBetween) * 7;
    console.log('Weekly rate calculated: ', weeklyRate);
    return weeklyRate;
  }

  private daysMaintained(trendPoints: WeightEntry[], goal: Goal | null, maintRange: number | null): number | null {
    if (!trendPoints.length || goal == null || maintRange == null) return null;

    const pts = trendPoints.filter(p => p.dateMs >= goal.startDateMs);
    if (!pts.length) return null;

    // If the most recent point is out of range, streak is 0
    if (Math.abs(pts[pts.length - 1].trend - goal.goalWeight) > maintRange) return 0;

    // Walk backward to find the first out-of-range point
    let streakStart = pts.length - 1;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (Math.abs(pts[i].trend - goal.goalWeight) > maintRange) break;
      streakStart = i;
    }

    return Math.max(0, Math.round((todayLocalMidnightMs() - pts[streakStart].dateMs) / 86400000));
  }

  private progressPercent(startWeight: number | null, trendWeight: number | null, goalWeight: number | null): number | null {
    if (startWeight == null || trendWeight == null || goalWeight == null) {
      return null;
    }

    const totalDelta = goalWeight - startWeight;
    if (Math.abs(totalDelta) < 0.001) {
      return 100;
    }

    const progressed = trendWeight - startWeight;
    const pct = (progressed / totalDelta) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  private expectedGoalDate(trendWeight: number | null, goalWeight: number | null, weeklyRate: number | null): string | null {
    if (trendWeight == null || goalWeight == null || weeklyRate == null) return null;
    const remaining = goalWeight - trendWeight;
    if (Math.abs(remaining) < 0.01) return 'Reached';
    if (Math.abs(weeklyRate) < 0.01) return 'Stalled';
    if (Math.sign(remaining) !== Math.sign(weeklyRate)) return 'Off track';

    const weeks = Math.abs(remaining / weeklyRate);
    const days = Math.ceil(weeks * 7);
    const goalDate = todayLocalMidnightDate();
    goalDate.setDate(goalDate.getDate() + days);

    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    if (goalDate.getFullYear() !== todayLocalMidnightDate().getFullYear()) {
      opts.year = '2-digit';
    }
    return goalDate.toLocaleDateString(undefined, opts);
  }

  private stabilityScore(reversedEntries: WeightEntry[], unitLabel: WeightUnit): number | null {
    const cutoffMs = todayLocalMidnightMs() - 7 * 86400000;
    const recent = reversedEntries.filter(e => e.dateMs >= cutoffMs);
    if (recent.length < 2) return null;
    const weights = recent.map(e => e.weight);
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + (w - mean) ** 2, 0) / weights.length;
    const sd = Math.sqrt(variance);
    const threshold = kgToUnit(1.5, unitLabel);
    return Math.max(0, Math.min(100, 100 * (1 - sd / threshold)));
  }

  private stabilityLabel(stabilityScore: number | null): string | null {
    if (stabilityScore == null) return null;
    if (stabilityScore >= 90) return 'Very stable';
    if (stabilityScore >= 75) return 'Stable';
    if (stabilityScore >= 50) return 'Some variation';
    return 'Fluctuating';
  }

  private consistencyLabel(reversedEntries: WeightEntry[]): string {
    const cutoffMs = todayLocalMidnightMs() - 7 * 86400000;
    const weeklyEntries = reversedEntries.filter(e => e.dateMs > cutoffMs);
    return `${weeklyEntries.length} / 7 check-ins`;
  }

  private rateLabel(weeklyRate: number | null, unitLabel: WeightUnit): string {
    if (weeklyRate == null) {
      return 'Need more data';
    }
    const sign = weeklyRate > 0 ? '+' : '';
    const fixed = unitLabel === 'st' ? 3 : 2;
    return `${sign}${weeklyRate.toFixed(fixed)} ${unitLabel}/week`;
  }

  private recommendation(
    trendWeight: number | null,
    weeklyRate: number | null,
    goalType: GoalType,
    goalWeight: number | null,
    stabilityScore: number | null,
    profile: UserProfile,
  ): string {
    if (trendWeight == null || weeklyRate == null) {
      return 'Log weight at least 3 times this week to unlock recommendations.';
    }

    // --- Profile-aware thresholds ---
    // Max safe loss rate: beginners/sedentary/endomorphs should lose slower to preserve muscle.
    // Advanced/very active users can tolerate a faster deficit safely.
    let maxLossRate = 1.0; // default % BW/week ceiling
    let idealGainCeiling = 0.5; // default % BW/week for lean gains
    let deficitStep = 200; // kcal adjustment size for loss
    let surplusStep = 200; // kcal adjustment size for gain
    let stepAdvice = ''; // extra context from profile

    if (profile.experience === 'Beginner') {
      // Beginners gain muscle faster → can tolerate slightly higher surplus
      idealGainCeiling = 0.6;
      maxLossRate = 0.7;
      deficitStep = 150;
    } else if (profile.experience === 'Advanced') {
      // Advanced trainees gain muscle slowly → keep surplus tight
      idealGainCeiling = 0.35;
      maxLossRate = 1.0;
      deficitStep = 250;
    }

    if (profile.activityLevel === 'Sedentary' || profile.activityLevel === 'Lightly Active') {
      // Less active = fewer calories burned → smaller adjustments needed
      deficitStep = Math.min(deficitStep, 150);
      surplusStep = Math.min(surplusStep, 150);
      stepAdvice = ' Focus on increasing daily movement (walking, stairs) alongside any dietary change.';
    } else if (profile.activityLevel === 'Very Active' || profile.activityLevel === 'Extra Active') {
      // Highly active = more room for dietary shifts
      deficitStep = Math.max(deficitStep, 200);
      surplusStep = Math.max(surplusStep, 250);
      stepAdvice = ' With your activity level, prioritize protein and recovery.';
    }

    if (profile.bodyType === 'Endomorph') {
      maxLossRate = Math.min(maxLossRate, 0.8);
      if (goalType === 'Weight Gain') stepAdvice = ' Monitor waist measurements closely — endomorphs tend to store fat more easily.';
    } else if (profile.bodyType === 'Ectomorph') {
      if (goalType === 'Weight Gain') surplusStep = Math.max(surplusStep, 300);
      if (goalType === 'Weight Gain') stepAdvice = ' Ectomorphs often need a larger surplus — calorie-dense foods like nuts, oils, and shakes help.';
    }

    if (profile.gender === 'Female') {
      // Women generally benefit from a more conservative deficit
      deficitStep = Math.min(deficitStep, 150);
      maxLossRate = Math.min(maxLossRate, 0.8);
    }

    if (profile.age != null && profile.age >= 50) {
      // Older adults should prioritize muscle preservation
      maxLossRate = Math.min(maxLossRate, 0.7);
      deficitStep = Math.min(deficitStep, 150);
      stepAdvice = stepAdvice || ' Prioritize protein intake and resistance training to preserve muscle mass.';
    }

    const bwPct = Math.abs((weeklyRate / trendWeight) * 100);
    const isGaining = weeklyRate > 0.01;
    const isLosing = weeklyRate < -0.01;
    const reachedGoal =
      goalWeight != null &&
      ((goalType === 'Weight Loss' && trendWeight <= goalWeight) || (goalType === 'Weight Gain' && trendWeight >= goalWeight));

    if (reachedGoal) {
      return 'You have reached your goal weight. Consider setting a maintenance or new target.';
    }

    switch (goalType) {
      case 'Weight Loss': {
        if (isGaining) {
          return 'Weight is trending up while in a loss phase. Re-evaluate intake — track a few days to find hidden calories.' + stepAdvice;
        }

        const nearLossGoal = goalWeight != null && goalWeight > 0 && ((trendWeight - goalWeight) / goalWeight) < 0.01;
        if (nearLossGoal) {
          return isLosing
            ? 'Almost at your goal — keep going, no changes needed.'
            : 'Nearly at your goal but progress has stalled. A small nudge — cut ~100 kcal or a short daily walk — should close the gap.';
        }

        if (bwPct > maxLossRate) {
          return `Loss rate exceeds ${maxLossRate}% BW/week. Slow down slightly to preserve lean mass and training performance.` + stepAdvice;
        }
        if (bwPct >= 0.5) {
          return 'Rate is in an ideal range for fat loss. Maintain current calories and activity.';
        }
        if (bwPct >= 0.25) {
          return 'Losing steadily. If progress stalls, a small calorie reduction or extra daily steps can help.';
        }
        if (isLosing) {
          return `Progress is slower than optimal. Try reducing intake by ~${deficitStep} kcal or adding 2,000 daily steps.` + stepAdvice;
        }
        return `Weight is flat. Create a modest deficit — cut ~${deficitStep} kcal or increase activity to get things moving.` + stepAdvice;
      }

      case 'Weight Gain': {
        if (isLosing) {
          return 'Weight is dropping during a gain phase. Increase calories — add a snack or larger portion to one meal.' + stepAdvice;
        }

        const nearGainGoal = goalWeight != null && goalWeight > 0 && ((goalWeight - trendWeight) / goalWeight) < 0.01;
        if (nearGainGoal) {
          return isGaining
            ? 'Almost at your goal — keep going, no changes needed.'
            : `Nearly at your goal but progress has stalled. A small nudge — add ~${Math.round(surplusStep / 2)} kcal or a calorie-dense snack — should close the gap.`;
        }

        if (bwPct > 1.0) {
          return `Gaining faster than 1% BW/week — excess is likely fat. Pull back surplus by ~${surplusStep} kcal.`;
        }
        if (bwPct >= idealGainCeiling) {
          return 'Gain rate is moderate. Monitor body composition — if waist is growing fast, trim surplus slightly.' + stepAdvice;
        }
        if (bwPct >= 0.2) {
          return 'Lean-gain pace is on track. Keep training hard and calories consistent.';
        }
        if (isGaining) {
          return `Gaining slowly. If strength is not progressing, try adding ~${Math.round(surplusStep * 0.75)} kcal from protein or carbs.` + stepAdvice;
        }
        return `Weight is flat. Increase intake — an extra ${surplusStep}–${surplusStep + 100} kcal should move the scale.` + stepAdvice;
      }

      case 'Maintenance': {
        if (goalWeight == null) {
          return 'No target weight set for maintenance. Keep logging to maintain current trends or set a clear goal.';
        }

        const offset = trendWeight - goalWeight;
        const offsetPct = (offset / goalWeight) * 100;
        const absOffsetPct = Math.abs(offsetPct);
        const isAbove = offsetPct > 0.5;
        const isBelow = offsetPct < -0.5;
        const onTarget = !isAbove && !isBelow;

        const movingAway = (isAbove && isGaining) || (isBelow && isLosing);
        const movingToward = (isAbove && isLosing) || (isBelow && isGaining);

        const noData = stabilityScore == null;
        const stable = !noData && stabilityScore >= 75;
        const moderate = !noData && stabilityScore >= 50 && stabilityScore < 75;
        const fluctuating = !noData && stabilityScore < 50;

        // --- High drift (>0.5% BW/week) ---
        if (bwPct > 0.5) {
          if (movingAway) {
            return isGaining
              ? 'Drifting rapidly above target. Reduce portion sizes or add low-intensity movement to correct course.'
              : 'Drifting rapidly below target. Increase meal sizes or add a snack to stabilize.';
          }
          if (movingToward) {
            return isGaining
              ? "Correcting quickly upward toward target. Good progress, but ease off soon so you don't overshoot."
              : "Correcting quickly downward toward target. Good progress, but ease off soon so you don't overshoot.";
          }
          if (onTarget) {
            if (fluctuating) {
              return 'Weight is near target but swinging rapidly. Focus on strict hydration and sodium consistency.';
            }
            return isGaining
              ? 'Weight is near target but trending up quickly. A small calorie trim now prevents a larger correction later.'
              : 'Weight is near target but trending down quickly. Slightly increase portions to avoid drifting below range.';
          }
        }

        // --- Moderate drift (0.2–0.5% BW/week) ---
        if (bwPct > 0.2) {
          if (movingAway) {
            if (fluctuating) {
              return isGaining
                ? 'Drifting above target with high variability. Tighten up meal consistency and watch sodium intake.'
                : 'Drifting below target with high variability. Ensure consistent meal timing and adequate calories.';
            }
            return isGaining
              ? 'Slowly trending above target. A small adjustment now — fewer liquid calories or an extra walk — prevents a bigger correction later.'
              : 'Slowly trending below target. Ensure you are eating enough to support training and recovery.';
          }
          if (movingToward) {
            if (fluctuating) {
              return 'Trending back toward target, but with high variability. Focus on steady habits to smooth the trend.';
            }
            return "Trending back toward target. Stay the course but monitor so you don't overshoot.";
          }
          if (onTarget) {
            if (fluctuating) {
              return 'Near target but weight is swinging. Keep meal timing and hydration consistent to smooth things out.';
            }
            return isGaining
              ? 'Near target with a slight upward drift. Stay mindful of portions this week to level off.'
              : 'Near target with a slight downward drift. Ensure meals are satisfying and consistent to level off.';
          }
        }

        // --- Low drift (<=0.2% BW/week) ---
        // Address large deviations first
        if (absOffsetPct > 1.5) {
          if (movingToward) {
            return isAbove
              ? 'Weight is well above target but slowly heading back down. Stay consistent — no drastic changes needed.'
              : 'Weight is well below target but slowly heading back up. Stay consistent — no drastic changes needed.';
          }
          if (movingAway) {
            return isAbove
              ? 'Weight is far above target and still creeping up. Create a calorie deficit — even a small one will help reverse the trend.'
              : 'Weight is far below target and still creeping down. Increase portions or add a calorie-dense snack to reverse the trend.';
          }
          if (isAbove) {
            return fluctuating
              ? 'Weight is fluctuating significantly above target. Focus on consistency before making large calorie cuts.'
              : 'Weight is settled far above target. Create a modest calorie deficit to return to your maintenance range.';
          }
          if (isBelow) {
            return fluctuating
              ? 'Weight is fluctuating significantly below target. Focus on regular meals before blindly adding calories.'
              : 'Weight is settled far below target. Add a daily snack or slightly larger portions to return to your range.';
          }
        }

        if (fluctuating) {
          return 'Weight is fluctuating near target. Review sodium, sleep, and stress — these often drive short-term swings.';
        }

        if (stable) {
          if (onTarget) return 'Excellent stability right on target. Maintain your current routine.';
          if (isAbove) return 'Weight is stable but sitting slightly above target. A very minor calorie reduction can realign it.';
          if (isBelow) return 'Weight is stable but sitting slightly below target. A very minor calorie increase can realign it.';
        }

        if (moderate) {
          if (onTarget) return 'Good stability near target. Minor day-to-day fluctuations are normal — stay the course.';
          if (isAbove) return 'Moderate stability slightly above target. Keep meal timing consistent and consider a small calorie trim.';
          if (isBelow)
            return 'Moderate stability slightly below target. Keep meal timing consistent and consider slightly larger portions.';
        }

        if (noData) {
          if (onTarget) return 'Weight is near target, but more data is needed to assess stability. Keep logging daily.';
          return 'Weight is slightly off target. Keep logging daily to track this trend before making adjustments.';
        }

        return 'Weight is generally on track. Keep doing what works — consistency is the goal here.';
      }
    }
  }

  private findActiveGoal(goals: Goal[]): Goal | null {
    if (!goals.length) return null;
    const today = todayLocalMidnightMs();
    // Find the earliest goal whose date is still in the future
    const future = goals.filter(g => g.goalDateMs >= today).sort((a, b) => a.goalDateMs - b.goalDateMs);
    // Fall back to the latest goal if all are past
    return future[0] ?? goals.sort((a, b) => b.goalDateMs - a.goalDateMs)[0];
  }
}
