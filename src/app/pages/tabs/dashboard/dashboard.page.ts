import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal, Signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { DatabaseService, Goal, GoalType, TrendPoint } from 'src/app/services/database.service';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { kgToUnit, formatWeight } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightString, todayLocalMidnightMs, todayLocalMidnightDate } from 'src/app/utils/date-converter.util';

interface DashboardVm {
  trendWeight: number | null;
  goalWeight: number | null;
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
  recentEntries: Array<{ label: string; weight: number }>;
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
  private readonly goals = toSignal(this.databaseService.goals$, { initialValue: [] as Goal[] });
  private readonly unitLabel = toSignal(this.databaseService.weightUnit$, { initialValue: 'kg' });

  readonly vm: Signal<DashboardVm> = computed(() => {
    const entries = this.databaseService.entries();
    const reversed = [...entries].reverse();
    const goals = this.goals();

    const rawTrend = this.databaseService.currentTrend();
    const trendWeight = rawTrend !== null ? formatWeight(rawTrend, this.unitLabel()) : null;
    const activeGoal = this.findActiveGoal(goals);
    const startWeight = activeGoal?.start_weight_kg ?? null;
    const goalWeight = activeGoal?.goal_weight_kg ?? null;
    const goalType = activeGoal?.label ?? 'Weight Loss';

    let maintRange: number | null = null;
    let maintOffset: number | null = null;
    let maintPercent: number | null = null;

    if (goalType === 'Maintenance' && rawTrend !== null && goalWeight !== null) {
      maintRange = kgToUnit(0.907186, this.unitLabel());
      maintOffset = formatWeight(rawTrend - goalWeight, this.unitLabel());
      // Map [maintRange, -maintRange] to [0%, 100%]
      maintPercent = Math.max(0, Math.min(100, ((maintOffset + maintRange) / (2 * maintRange)) * 100));
    }

    const weeklyRate = this.weeklyRate(rawTrend);
    const progressPercent = this.progressPercent(startWeight, rawTrend, goalWeight);
    const expectedGoalDate = this.expectedGoalDate(rawTrend, goalWeight, weeklyRate);
    const bwPercentPerWeek = this.bwPercentPerWeek(rawTrend, weeklyRate);
    const absoluteRatePerWeek = this.absoluteRatePerWeek(weeklyRate);
    const remaining = this.remaining(rawTrend, goalWeight);
    const totalProgress = this.totalProgress(startWeight, rawTrend);
    const daysToGoal = this.daysToGoal(rawTrend, goalWeight, weeklyRate);
    const daysMaintained = goalType === 'Maintenance' ? this.daysMaintained(entries, activeGoal, maintRange) : null;
    const stabilityLabel = this.stabilityLabel(reversed);
    const consistency = this.consistencyLabel(reversed);

    return {
      trendWeight,
      goalWeight,
      startWeight,
      goalType,
      maintRange,
      maintOffset,
      maintPercent,
      progressPercent,
      bwPercentPerWeek,
      absoluteRatePerWeek,
      remaining,
      totalProgress,
      expectedGoalDate,
      daysToGoal,
      daysMaintained,
      stabilityLabel,
      consistency,
      recommendation: this.recommendation(rawTrend, weeklyRate, goalType, goalWeight),
      rateLabel: this.rateLabel(weeklyRate),
      recentEntries: this.recentEntries(reversed),
      unitLabel: this.unitLabel(),
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

  private recentEntries(entries: TrendPoint[]): Array<{ label: string; weight: number }> {
    return entries.slice(0, 3).map(entry => ({
      label: this.entryLabel(entry.dateMs),
      weight: entry.weight,
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

  private absoluteRatePerWeek(weeklyRate: number | null): string | null {
    if (weeklyRate == null) return null;
    const sign = weeklyRate > 0 ? '+' : '';
    return `${sign}${weeklyRate.toFixed(2)}`;
  }

  private remaining(trendWeight: number | null, goalWeight: number | null): string | null {
    if (trendWeight == null || goalWeight == null) return null;
    const diff = Math.abs(goalWeight - trendWeight);
    return diff < 0.01 ? '0' : diff.toFixed(1);
  }

  private totalProgress(startWeight: number | null, trendWeight: number | null): string | null {
    if (startWeight == null || trendWeight == null) return null;
    const diff = trendWeight - startWeight;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}`;
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

  private weeklyRate(currentTrend: number | null): number | null {
    if (currentTrend == null) return null;
    const trend7dAgo = this.databaseService.trendAt(todayLocalMidnightMs() - 7 * 86400000);
    if (trend7dAgo == null) return null;
    return currentTrend - trend7dAgo;
  }

  private daysMaintained(trendPoints: TrendPoint[], goal: Goal | null, maintRange: number | null): number | null {
    if (!trendPoints.length || goal == null || maintRange == null) return null;

    const goalStart = +new Date(goal.start_date);
    const pts = trendPoints.filter(p => p.dateMs >= goalStart);
    if (!pts.length) return null;

    // If the most recent point is out of range, streak is 0
    if (Math.abs(pts[pts.length - 1].trend - goal.goal_weight_kg) > maintRange) return 0;

    // Walk backward to find the first out-of-range point
    let streakStart = pts.length - 1;
    for (let i = pts.length - 1; i >= 0; i--) {
      if (Math.abs(pts[i].trend - goal.goal_weight_kg) > maintRange) break;
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

  private stabilityLabel(reversedEntries: TrendPoint[]): string | null {
    const cutoffMs = todayLocalMidnightMs() - 7 * 86400000;
    const recent = reversedEntries.filter(e => e.dateMs >= cutoffMs);
    if (recent.length < 2) return null;
    const weights = recent.map(e => e.weight);
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance = weights.reduce((sum, w) => sum + (w - mean) ** 2, 0) / weights.length;
    const sd = Math.sqrt(variance);
    const threshold = kgToUnit(1.5, this.unitLabel());
    const score = Math.max(0, Math.min(100, 100 * (1 - sd / threshold)));
    if (score >= 90) return 'Very stable';
    if (score >= 75) return 'Stable';
    if (score >= 50) return 'Some variation';
    return 'Fluctuating';
  }

  private consistencyLabel(reversedEntries: TrendPoint[]): string {
    const cutoffMs = todayLocalMidnightMs() - 7 * 86400000;
    const weeklyEntries = reversedEntries.filter(e => e.dateMs >= cutoffMs);
    return `${weeklyEntries.length} / 7 check-ins`;
  }

  private rateLabel(weeklyRate: number | null): string {
    if (weeklyRate == null) {
      return 'Need more data';
    }
    const sign = weeklyRate > 0 ? '+' : '';
    return `${sign}${weeklyRate.toFixed(2)} ${this.unitLabel()}/week`;
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
    const future = goals.filter(g => +new Date(g.goal_date) >= today).sort((a, b) => +new Date(a.goal_date) - +new Date(b.goal_date));
    // Fall back to the latest goal if all are past
    return future[0] ?? goals.sort((a, b) => +new Date(b.goal_date) - +new Date(a.goal_date))[0];
  }
}
