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
import { DatabaseService, Goal, GoalType, WeightEntry, WeightUnit } from 'src/app/services/database.service';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { kgToUnitFixed, formatWeight, kgToUnit } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightMs, todayLocalMidnightDate } from 'src/app/utils/date-converter.util';

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
      stabilityLabel: this.stabilityLabel(reversed, weightUnit),
      consistency: this.consistencyLabel(reversed),
      recommendation: this.recommendation(rawTrend, weeklyRate, goalType, goalWeight),
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

  private stabilityLabel(reversedEntries: WeightEntry[], unitLabel: WeightUnit): string | null {
    const cutoffMs = todayLocalMidnightMs() - 7 * 86400000;
    const recent = reversedEntries.filter(e => e.dateMs >= cutoffMs);
    if (recent.length < 2) return null;
    const weights = recent.map(e => e.weight);
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + (w - mean) ** 2, 0) / weights.length;
    const sd = Math.sqrt(variance);
    const threshold = kgToUnit(1.5, unitLabel);
    const score = Math.max(0, Math.min(100, 100 * (1 - sd / threshold)));
    if (score >= 90) return 'Very stable';
    if (score >= 75) return 'Stable';
    if (score >= 50) return 'Some variation';
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

  private recommendation(trendWeight: number | null, weeklyRate: number | null, goalType: GoalType, goalWeight: number | null): string {
    if (trendWeight == null || weeklyRate == null) {
      return 'Log weight at least 3 times this week to unlock recommendations.';
    }

    const bwPct = Math.abs((weeklyRate / trendWeight) * 100);
    const isGaining = weeklyRate > 0.01;
    const isLosing = weeklyRate < -0.01;
    const reachedGoal = goalWeight != null && Math.abs(trendWeight - goalWeight) < 0.3;

    if (reachedGoal && goalType !== 'Maintenance') {
      return 'You have reached your goal weight. Consider setting a maintenance or new target.';
    }

    switch (goalType) {
      case 'Weight Loss': {
        if (isGaining) {
          return 'Weight is trending up while in a loss phase. Re-evaluate intake — track a few days to find hidden calories.';
        }
        if (bwPct > 1.0) {
          return 'Loss rate exceeds 1% BW/week. Slow down slightly to preserve lean mass and training performance.';
        }
        if (bwPct >= 0.5) {
          return 'Rate is in an ideal range for fat loss. Maintain current calories and activity.';
        }
        if (bwPct >= 0.25) {
          return 'Losing steadily. If progress stalls, a small calorie reduction or extra daily steps can help.';
        }
        if (isLosing) {
          return 'Progress is slower than optimal. Try reducing intake by ~100–200 kcal or adding 2,000 daily steps.';
        }
        return 'Weight is flat. Create a modest deficit — cut ~250 kcal or increase activity to get things moving.';
      }

      case 'Weight Gain': {
        if (isLosing) {
          return 'Weight is dropping during a gain phase. Increase calories — add a snack or larger portion to one meal.';
        }
        if (bwPct > 1.0) {
          return 'Gaining faster than 1% BW/week — excess is likely fat. Pull back surplus by ~200 kcal.';
        }
        if (bwPct >= 0.5) {
          return 'Gain rate is moderate. Monitor body composition — if waist is growing fast, trim surplus slightly.';
        }
        if (bwPct >= 0.2) {
          return 'Lean-gain pace is on track. Keep training hard and calories consistent.';
        }
        if (isGaining) {
          return 'Gaining slowly. If strength is not progressing, try adding ~150 kcal from protein or carbs.';
        }
        return 'Weight is flat. Increase intake — an extra 200–300 kcal should move the scale.';
      }

      case 'Maintenance': {
        if (bwPct > 0.5) {
          return isGaining
            ? 'Drifting above maintenance. Reduce portion sizes slightly or add some low-intensity movement.'
            : 'Drifting below maintenance. Add a small snack or slightly larger meals to stabilize.';
        }
        if (bwPct > 0.2) {
          return isGaining
            ? 'Slight upward drift. Stay mindful of weekend intake — a small adjustment now prevents larger corrections later.'
            : 'Slight downward drift. Ensure you are eating enough to support training and recovery.';
        }
        return 'Weight is stable. Keep doing what works — consistency is the goal here.';
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
