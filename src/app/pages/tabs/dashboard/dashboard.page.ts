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
import { DatabaseService, Goal, GoalType, WeightEntry, WeightUnit, UserSettingsDB } from 'src/app/services/database.service';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { formatWeight, kgToUnit } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightMs, todayLocalMidnightDate } from 'src/app/utils/date-converter.util';

interface DashboardVm {
  trendToFixed: string | null;
  goalWeight: string | null;
  startWeight: number | null;
  goalType: GoalType | null;
  maintRange: string | null;
  maintOffset: string | null;
  maintPercent: number | null;
  scheduleOffset: string | null;
  scheduleRange: string | null;
  schedulePercent: number | null;
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
    const userSettings = this.databaseService.settings();
    const recentEntries = this.databaseService.recentEntries();
    const reversed = [...recentEntries].reverse();
    const entriesAfterGoalStart = this.databaseService.entriesAfterGoalStart();
    const weightUnit = this.databaseService.weightUnit();
    const latestEntry = this.databaseService.latestEntry();
    const rawTrend = latestEntry?.trend ?? null;
    const trendToFixed = rawTrend !== null ? formatWeight(rawTrend, weightUnit) : null;
    const activeGoal = this.databaseService.activeGoal();
    const goalReached = this.goalReached(trendToFixed, activeGoal);
    const startWeight = activeGoal?.startWeight ?? null;
    const goalWeight = activeGoal?.goalWeight ?? null;
    const goalType = activeGoal?.type ?? null;
    const weeklyRate = this.weeklyRate(latestEntry, recentEntries);
    const stabilityScore = goalType === 'Maintenance' ? this.stabilityScore(reversed, weightUnit) : null;

    const { maintRangePct, scheduleToleranceWeeks, noiseFloorPct } = this.getDynamicThresholds(userSettings);
    let maintRange: number | null = null;
    let maintOffset: number | null = null;
    let maintPercent: number | null = null;

    if (goalType === 'Maintenance' && rawTrend !== null && goalWeight !== null) {
      maintRange = goalWeight * (maintRangePct / 100);
      maintOffset = rawTrend - goalWeight;
      // Map [maintRange, -maintRange] to [0%, 100%]
      maintPercent = Math.max(0, Math.min(100, ((maintOffset + maintRange) / (2 * maintRange)) * 100));
    }

    const scheduleProjection: { projectedWeight: number; range: number } | null = this.scheduleProjection(
      rawTrend,
      activeGoal,
      scheduleToleranceWeeks,
      noiseFloorPct,
    );
    let scheduleOffset: number | null = null;
    let scheduleRange: number | null = null;
    let schedulePercent: number | null = null;

    if (scheduleProjection && rawTrend !== null) {
      scheduleRange = scheduleProjection.range;
      scheduleOffset = rawTrend - scheduleProjection.projectedWeight;
      // Percent: Behind=left(0%), On-track=center(50%), Ahead=right(100%)
      if (scheduleRange > 0) {
        const normalizedOffset = goalType === 'Weight Loss' ? -scheduleOffset : scheduleOffset;
        schedulePercent = Math.max(0, Math.min(100, ((normalizedOffset + scheduleRange) / (2 * scheduleRange)) * 100));
      }
    }

    return {
      trendToFixed,
      goalWeight: formatWeight(goalWeight ?? 0, weightUnit),
      startWeight,
      goalType,
      maintRange: formatWeight(maintRange ?? 0, weightUnit),
      maintOffset: formatWeight(maintOffset ?? 0, weightUnit),
      maintPercent,
      scheduleOffset: formatWeight(scheduleOffset ?? 0, weightUnit),
      scheduleRange: formatWeight(scheduleRange ?? 0, weightUnit),
      schedulePercent,
      progressPercent: this.progressPercent(startWeight, rawTrend, goalWeight),
      bwPercentPerWeek: this.bwPercentPerWeek(rawTrend, weeklyRate),
      absoluteRatePerWeek: this.absoluteRatePerWeek(weeklyRate, weightUnit),
      remaining: this.remaining(rawTrend, goalWeight, weightUnit),
      totalProgress: this.totalProgress(startWeight, rawTrend, weightUnit),
      expectedGoalDate: this.expectedGoalDate(rawTrend, goalWeight, weeklyRate, goalReached),
      daysToGoal: this.daysToGoal(rawTrend, goalWeight, weeklyRate, goalReached),
      daysMaintained: goalType === 'Maintenance' ? this.daysMaintained(entriesAfterGoalStart, activeGoal, maintRange) : null,
      stabilityLabel: this.stabilityLabel(stabilityScore),
      consistency: this.consistencyLabel(reversed),
      recommendation: this.recommendation(
        rawTrend,
        weeklyRate,
        activeGoal,
        stabilityScore,
        userSettings,
        scheduleProjection,
        goalReached,
        maintRangePct,
      ),
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

  private daysToGoal(
    trendWeight: number | null,
    goalWeight: number | null,
    weeklyRate: number | null,
    goalReached: boolean,
  ): string | null {
    if (trendWeight == null || goalWeight == null || weeklyRate == null) return null;
    const remaining = goalWeight - trendWeight;
    if (goalReached) return '0 days';
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

  private daysMaintained(entriesAfterGoalStart: WeightEntry[], goal: Goal | null, maintRange: number | null): number | null {
    if (!entriesAfterGoalStart.length || goal == null || maintRange == null) return null;

    // If the most recent point is out of range, streak is 0
    if (Math.abs(entriesAfterGoalStart[entriesAfterGoalStart.length - 1].trend - goal.goalWeight) > maintRange) return 0;

    // Walk backward to find the first out-of-range point
    let streakStart = entriesAfterGoalStart.length - 1;
    for (let i = entriesAfterGoalStart.length - 1; i >= 0; i--) {
      if (Math.abs(entriesAfterGoalStart[i].trend - goal.goalWeight) > maintRange) break;
      streakStart = i;
    }

    return Math.max(0, Math.round((todayLocalMidnightMs() - entriesAfterGoalStart[streakStart].dateMs) / 86400000));
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

  private expectedGoalDate(
    trendWeight: number | null,
    goalWeight: number | null,
    weeklyRate: number | null,
    goalReached: boolean,
  ): string | null {
    if (trendWeight == null || goalWeight == null || weeklyRate == null) return null;
    const remaining = goalWeight - trendWeight;
    console.log('Calculating expected goal date: remaining:', remaining);
    if (goalReached) return 'Reached';
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
    // TODO: check how it differs if you increase the number of entries
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

  private goalReached(currentTrend: string | null, activeGoal: Goal | null): boolean {
    if (!activeGoal || currentTrend == null) return false;
    const trendValue = parseFloat(currentTrend);
    const { goalWeight, type: goalType } = activeGoal;
    const reachedGoal =
      goalWeight != null &&
      ((goalType === 'Weight Loss' && trendValue <= goalWeight) || (goalType === 'Weight Gain' && trendValue >= goalWeight));
    return reachedGoal;
  }

  private scheduleProjection(
    trendWeight: number | null,
    activeGoal: Goal | null,
    scheduleToleranceWeeks: number,
    noiseFloorPct: number,
  ): { projectedWeight: number; range: number } | null {
    if (
      trendWeight == null ||
      !activeGoal ||
      activeGoal.goalWeight == null ||
      activeGoal.startWeight == null ||
      activeGoal.type === 'Maintenance'
    ) {
      return null;
    }
    console.log('Calculating schedule projection for trendWeight:', trendWeight, 'activeGoal:', activeGoal);
    const today = todayLocalMidnightMs();
    const totalDuration = activeGoal.goalDateMs - activeGoal.startDateMs;
    const elapsed = today - activeGoal.startDateMs;
    if (totalDuration <= 0 || elapsed <= 0 || elapsed >= totalDuration) return null;

    const delta = activeGoal.goalWeight - activeGoal.startWeight;
    const projectedWeight = activeGoal.startWeight + delta * (elapsed / totalDuration);
    const totalDays = totalDuration / 86400000;
    const range = Math.max(Math.abs(delta / totalDays) * scheduleToleranceWeeks * 7, trendWeight * noiseFloorPct);

    console.log('Schedule projection:', { projectedWeight, range });
    return { projectedWeight, range };
  }

  private getDynamicThresholds(userSettings: UserSettingsDB | null): {
    maintRangePct: number;
    scheduleToleranceWeeks: number;
    noiseFloorPct: number;
  } {
    if (userSettings == null) {
      return { maintRangePct: 1.5, scheduleToleranceWeeks: 2.0, noiseFloorPct: 0.005 };
    }

    const isFemale = userSettings.gender === 'Female';

    if (isFemale) {
      switch (userSettings.experience) {
        case 'Beginner':
          return { maintRangePct: 2.5, scheduleToleranceWeeks: 3.5, noiseFloorPct: 0.0125 };
        case 'Advanced':
          return { maintRangePct: 1.5, scheduleToleranceWeeks: 2.0, noiseFloorPct: 0.0075 };
        default:
          return { maintRangePct: 2.0, scheduleToleranceWeeks: 3.0, noiseFloorPct: 0.01 };
      }
    }

    switch (userSettings.experience) {
      case 'Beginner':
        return { maintRangePct: 2.0, scheduleToleranceWeeks: 2.5, noiseFloorPct: 0.0075 };
      case 'Advanced':
        return { maintRangePct: 1.2, scheduleToleranceWeeks: 1.5, noiseFloorPct: 0.004 };
      default:
        return { maintRangePct: 1.5, scheduleToleranceWeeks: 2.0, noiseFloorPct: 0.005 };
    }
  }

  private recommendation(
    trendWeight: number | null,
    weeklyRate: number | null,
    activeGoal: Goal | null,
    stabilityScore: number | null,
    userSettings: UserSettingsDB | null,
    idealCurrentWeight: { projectedWeight: number; range: number } | null,
    goalReached: boolean,
    maintRangePct: number | null,
  ): string {
    if (!activeGoal) {
      return 'Set a new goal to receive personalized recommendations.';
    }
    if (trendWeight == null || weeklyRate == null || userSettings == null) {
      return 'Log weight at least 2 times to unlock custom recommendations.';
    }

    const goalWeight = activeGoal.goalWeight;
    const goalType = activeGoal.type;

    // --- Profile-aware thresholds ---
    // Max safe loss rate: beginners/sedentary/endomorphs should lose slower to preserve muscle.
    // Advanced/very active users can tolerate a faster deficit safely.
    let maxLossRate = 1.0; // default % BW/week ceiling
    let idealGainCeiling = 0.5; // default % BW/week for lean gains
    let deficitStep = 200; // kcal adjustment size for loss
    let surplusStep = 200; // kcal adjustment size for gain
    let stepAdvice = ''; // extra context from profile

    if (userSettings.experience === 'Beginner') {
      // Beginners gain muscle faster → can tolerate slightly higher surplus
      idealGainCeiling = 0.6;
      maxLossRate = 0.7;
      deficitStep = 150;
    } else if (userSettings.experience === 'Advanced') {
      // Advanced trainees gain muscle slowly → keep surplus tight
      idealGainCeiling = 0.35;
      maxLossRate = 1.0;
      deficitStep = 250;
    }

    if (userSettings.activity_level === 'Sedentary' || userSettings.activity_level === 'Lightly Active') {
      // Less active = fewer calories burned → smaller adjustments needed
      deficitStep = Math.min(deficitStep, 150);
      surplusStep = Math.min(surplusStep, 150);
      stepAdvice = ' Focus on increasing daily movement (walking, stairs) alongside any dietary change.';
    } else if (userSettings.activity_level === 'Very Active' || userSettings.activity_level === 'Extra Active') {
      // Highly active = more room for dietary shifts
      deficitStep = Math.max(deficitStep, 200);
      surplusStep = Math.max(surplusStep, 250);
      stepAdvice = ' With your activity level, prioritize protein and recovery.';
    }

    if (userSettings.body_type === 'Endomorph') {
      maxLossRate = Math.min(maxLossRate, 0.8);
      if (goalType === 'Weight Gain') stepAdvice = ' Monitor waist measurements closely — endomorphs tend to store fat more easily.';
    } else if (userSettings.body_type === 'Ectomorph') {
      if (goalType === 'Weight Gain') surplusStep = Math.max(surplusStep, 300);
      if (goalType === 'Weight Gain')
        stepAdvice = ' Ectomorphs often need a larger surplus — calorie-dense foods like nuts, oils, and shakes help.';
    }

    if (userSettings.gender === 'Female') {
      // Women generally benefit from a more conservative deficit
      deficitStep = Math.min(deficitStep, 150);
      maxLossRate = Math.min(maxLossRate, 0.8);
    }

    if (userSettings.age != null && userSettings.age >= 50) {
      // Older adults should prioritize muscle preservation
      maxLossRate = Math.min(maxLossRate, 0.7);
      deficitStep = Math.min(deficitStep, 150);
      stepAdvice = stepAdvice || ' Prioritize protein intake and resistance training to preserve muscle mass.';
    }

    const bwPct = Math.abs((weeklyRate / trendWeight) * 100);
    const isGaining = weeklyRate > 0.01;
    const isLosing = weeklyRate < -0.01;

    // --- Schedule awareness (uses same ±1 week range as the visual) ---
    let scheduleStatus: 'ahead' | 'behind' | 'on-track' | null = null;
    if (idealCurrentWeight) {
      const deviation = Math.abs(trendWeight - idealCurrentWeight.projectedWeight);
      if (idealCurrentWeight.range > 0 && deviation > idealCurrentWeight.range) {
        if (goalType === 'Weight Loss') {
          scheduleStatus = trendWeight < idealCurrentWeight.projectedWeight ? 'ahead' : 'behind';
        } else {
          scheduleStatus = trendWeight > idealCurrentWeight.projectedWeight ? 'ahead' : 'behind';
        }
      } else {
        scheduleStatus = 'on-track';
      }
    }

    if (goalReached) {
      return 'You have reached your goal weight. Consider setting a maintenance or new target.';
    }

    switch (goalType) {
      case 'Weight Loss': {
        if (isGaining) {
          if (scheduleStatus === 'behind') {
            return (
              "Weight is trending up and you're falling behind schedule. Re-evaluate intake urgently — track every meal for a few days." +
              stepAdvice
            );
          }
          return (
            'Weight is trending up while in a loss phase. Re-evaluate intake — track a few days to find hidden calories.' + stepAdvice
          );
        }

        const nearLossGoal = goalWeight != null && goalWeight > 0 && (trendWeight - goalWeight) / goalWeight < 0.01;
        if (nearLossGoal) {
          return isLosing
            ? 'Almost at your goal — keep going, no changes needed.'
            : 'Nearly at your goal but progress has stalled. A small nudge — cut ~100 kcal or a short daily walk — should close the gap.';
        }

        if (bwPct > maxLossRate) {
          if (scheduleStatus === 'ahead') {
            return `Loss rate exceeds ${maxLossRate}% BW/week, but you're ahead of schedule. Ease off slightly — you can afford to slow down and preserve lean mass.`;
          }
          return (
            `Loss rate exceeds ${maxLossRate}% BW/week. Slow down slightly to preserve lean mass and training performance.` + stepAdvice
          );
        }
        if (bwPct >= 0.5) {
          if (scheduleStatus === 'ahead') {
            return "Rate is ideal for fat loss and you're ahead of schedule. Great position — maintain or even relax slightly.";
          }
          return 'Rate is in an ideal range for fat loss. Maintain current calories and activity.';
        }
        if (bwPct >= 0.25) {
          if (scheduleStatus === 'behind') {
            return (
              `Losing steadily but behind schedule. Consider increasing your deficit by ~${deficitStep} kcal to catch up.` + stepAdvice
            );
          }
          return 'Losing steadily. If progress stalls, a small calorie reduction or extra daily steps can help.';
        }
        if (isLosing) {
          if (scheduleStatus === 'behind') {
            return (
              `Progress is slow and you\'re behind schedule. Try reducing intake by ~${deficitStep} kcal and adding 2,000–3,000 daily steps to get back on track.` +
              stepAdvice
            );
          }
          return (
            `Progress is slower than optimal. Try reducing intake by ~${deficitStep} kcal or adding 2,000 daily steps.` + stepAdvice
          );
        }
        if (scheduleStatus === 'behind') {
          return (
            `Weight is flat and you\'re falling behind schedule. Create a deficit now — cut ~${deficitStep} kcal and add daily activity.` +
            stepAdvice
          );
        }
        return (
          `Weight is flat. Create a modest deficit — cut ~${deficitStep} kcal or increase activity to get things moving.` + stepAdvice
        );
      }

      case 'Weight Gain': {
        if (isLosing) {
          if (scheduleStatus === 'behind') {
            return (
              "Weight is dropping and you're falling behind schedule. Increase calories significantly — add 2 snacks or a calorie-dense shake daily." +
              stepAdvice
            );
          }
          return 'Weight is dropping during a gain phase. Increase calories — add a snack or larger portion to one meal.' + stepAdvice;
        }

        const nearGainGoal = goalWeight != null && goalWeight > 0 && (goalWeight - trendWeight) / goalWeight < 0.01;
        if (nearGainGoal) {
          return isGaining
            ? 'Almost at your goal — keep going, no changes needed.'
            : `Nearly at your goal but progress has stalled. A small nudge — add ~${Math.round(surplusStep / 2)} kcal or a calorie-dense snack — should close the gap.`;
        }

        if (bwPct > 1.0) {
          if (scheduleStatus === 'ahead') {
            return `Gaining faster than 1% BW/week and already ahead of schedule. Pull back surplus by ~${surplusStep} kcal — no need to rush.`;
          }
          return `Gaining faster than 1% BW/week — excess is likely fat. Pull back surplus by ~${surplusStep} kcal.`;
        }
        if (bwPct >= idealGainCeiling) {
          if (scheduleStatus === 'ahead') {
            return "Gain rate is moderate and you're ahead of schedule. Consider maintaining current intake without increasing further.";
          }
          return 'Gain rate is moderate. Monitor body composition — if waist is growing fast, trim surplus slightly.' + stepAdvice;
        }
        if (bwPct >= 0.2) {
          if (scheduleStatus === 'behind') {
            return (
              `Lean-gain pace is steady but you\'re behind schedule. Try adding ~${Math.round(surplusStep * 0.5)} kcal to pick up the pace.` +
              stepAdvice
            );
          }
          return 'Lean-gain pace is on track. Keep training hard and calories consistent.';
        }
        if (isGaining) {
          if (scheduleStatus === 'behind') {
            return (
              `Gaining slowly and behind schedule. Add ~${surplusStep} kcal from protein or carbs to get back on track.` + stepAdvice
            );
          }
          return (
            `Gaining slowly. If strength is not progressing, try adding ~${Math.round(surplusStep * 0.75)} kcal from protein or carbs.` +
            stepAdvice
          );
        }
        if (scheduleStatus === 'behind') {
          return (
            `Weight is flat and you\'re behind schedule. Increase intake by ~${surplusStep}–${surplusStep + 100} kcal — calorie-dense foods help.` +
            stepAdvice
          );
        }
        return `Weight is flat. Increase intake — an extra ${surplusStep}–${surplusStep + 100} kcal should move the scale.` + stepAdvice;
      }

      case 'Maintenance': {
        if (goalWeight == null || maintRangePct == null) {
          return 'No target weight set for maintenance. Keep logging to maintain current trends or set a clear goal.';
        }

        const offset = trendWeight - goalWeight;
        const offsetPct = (offset / goalWeight) * 100;
        const absOffsetPct = Math.abs(offsetPct);
        const thresholdPct = maintRangePct / 2;
        const isAbove = offsetPct > thresholdPct;
        const isBelow = offsetPct < -thresholdPct;
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
}
