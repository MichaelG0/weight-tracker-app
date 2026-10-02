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
  IonButton,
  IonGrid,
  IonRow,
  IonCol,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trendingDownOutline } from 'ionicons/icons';
import { DatabaseService, Goal, GoalType, WeightEntry, WeightUnit, UserSettingsExtended } from 'src/app/services/database.service';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { LogWeightModalComponent } from 'src/app/components/log-weight-modal/log-weight-modal.component';
import { SetGoalModalComponent } from 'src/app/components/set-goal-modal/set-goal-modal.component';
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
  bwPercentPerWeek: string | null;
  absoluteRatePerWeek: string | null;
  remaining: string | null;
  totalProgress: string | null;
  expectedGoalDate: string | null;
  daysToGoal: string | null;
  daysMaintained: number | null;
  stabilityLabel: string | null;
  goalReached: boolean;
  consistency: string;
  dataQualityLabel: string | null;
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
  private readonly weeklyRateLookbackDays = 14;

  readonly statFlip = signal<[boolean, boolean, boolean]>([false, false, false]);

  readonly vm: Signal<DashboardVm> = computed(() => {
    const userSettings = this.databaseService.extendedSettings();
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
    const rawWeeklyRateAbs = this.rawWeeklyRateAbs(latestEntry, entriesAfterGoalStart);
    const stabilityScore = goalType === 'Maintenance' ? this.stabilityScore(entriesAfterGoalStart, weightUnit) : null;
    const dataQualityLabel = activeGoal ? this.dataQualityLabel(entriesAfterGoalStart) : null;

    // prettier-ignore
    const maintRange = userSettings?.coaching.maintRange ?? null;
    let maintOffset: number | null = null;
    let maintPercent: number | null = null;

    if (goalType === 'Maintenance' && rawTrend !== null && goalWeight !== null && maintRange !== null) {
      maintOffset = rawTrend - goalWeight;
      // Map [maintRange, -maintRange] to [0%, 100%]
      maintPercent = Math.max(0, Math.min(100, ((maintOffset + maintRange) / (2 * maintRange)) * 100));
    }

    let scheduleProjection: { projectedWeight: number; range: number } | null = null;
    let scheduleOffset: number | null = null;
    let scheduleRange: number | null = null;
    let schedulePercent: number | null = null;
    const stallWeeks = goalType !== 'Maintenance' ? this.stallWeeks(entriesAfterGoalStart, activeGoal, userSettings) : 0;
    const maintenanceOutOfRangeDays =
      goalType === 'Maintenance' ? this.outOfRangeStreakWeeks(entriesAfterGoalStart, activeGoal, maintRange) : 0;

    if (goalType == 'Weight Loss' || (goalType == 'Weight Gain' && rawTrend !== null)) {
      scheduleProjection = this.scheduleProjection(rawTrend, activeGoal, userSettings);
      if (scheduleProjection) {
        scheduleRange = scheduleProjection.range;
        scheduleOffset = rawTrend! - scheduleProjection.projectedWeight;
        // Percent: Behind=left(0%), On-track=center(50%), Ahead=right(100%)
        if (scheduleRange > 0) {
          const normalizedOffset = goalType === 'Weight Loss' ? -scheduleOffset : scheduleOffset;
          schedulePercent = Math.max(0, Math.min(100, ((normalizedOffset + scheduleRange) / (2 * scheduleRange)) * 100));
        }
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
      goalReached,
      bwPercentPerWeek: this.bwPercentPerWeek(rawTrend, rawWeeklyRateAbs),
      absoluteRatePerWeek: this.absoluteRatePerWeek(rawWeeklyRateAbs, weightUnit),
      remaining: this.remaining(rawTrend, goalWeight, weightUnit),
      totalProgress: this.totalProgress(startWeight, rawTrend, weightUnit),
      expectedGoalDate: this.expectedGoalDate(rawTrend, goalWeight, rawWeeklyRateAbs, goalReached),
      daysToGoal: this.daysToGoal(rawTrend, goalWeight, rawWeeklyRateAbs, goalReached),
      daysMaintained: goalType === 'Maintenance' ? this.daysMaintained(entriesAfterGoalStart, activeGoal, maintRange) : null,
      stabilityLabel: this.stabilityLabel(stabilityScore),
      consistency: this.consistencyLabel(entriesAfterGoalStart),
      dataQualityLabel,
      recommendation: this.recommendation(
        rawTrend,
        rawWeeklyRateAbs,
        activeGoal,
        stabilityScore,
        userSettings,
        scheduleProjection,
        goalReached,
        stallWeeks,
        maintenanceOutOfRangeDays,
      ),
      rateLabel: this.rateLabel(rawWeeklyRateAbs, weightUnit),
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

  async openSetGoal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SetGoalModalComponent,
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
    return `${sign}${formatWeight(weeklyRate, weightUnit, 1)}`;
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

  private daysToGoal(trendWeight: number | null, goalWeight: number | null, weeklyRate: number | null, goalReached: boolean): string | null {
    if (trendWeight == null || goalWeight == null || weeklyRate == null) return null;
    const remaining = goalWeight - trendWeight;
    if (goalReached) return '0 days';
    if (Math.abs(weeklyRate) < 0.01) return 'Stalled';
    if (Math.sign(remaining) !== Math.sign(weeklyRate)) return 'Off track';
    const weeks = Math.abs(remaining / weeklyRate);
    return `${Math.ceil(weeks * 7)} days`;
  }

  private rawWeeklyRateAbs(latestEntry: WeightEntry | null, entriesAfterGoalStart: WeightEntry[]): number | null {
    if (latestEntry == null || entriesAfterGoalStart.length < 2) return null;
    const latestMs = latestEntry.dateMs;
    const lookbackStartMs = latestMs - this.weeklyRateLookbackDays * 86400000;
    const samples = entriesAfterGoalStart.filter(e => e.dateMs >= lookbackStartMs && e.dateMs <= latestMs);
    if (samples.length < 2) return null;

    const points = samples.map(entry => ({
      x: (entry.dateMs - latestMs) / 86400000,
      y: entry.weight,
    }));
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    if (denominator === 0) return null;

    const slopePerDay = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
    return slopePerDay * 7;
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

  private stabilityScore(entriesAfterGoalStart: WeightEntry[], unitLabel: WeightUnit): number | null {
    const cutoffMs = todayLocalMidnightMs() - 7 * 86400000;
    const recent = entriesAfterGoalStart.filter(e => e.dateMs >= cutoffMs);
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

  private dataQualityLabel(entriesAfterGoalStart: WeightEntry[]): string | null {
    if (entriesAfterGoalStart.length < 2) return null;

    const latestEntry = entriesAfterGoalStart[entriesAfterGoalStart.length - 1];
    const todayMs = todayLocalMidnightMs();

    // Mirror the exact window rawWeeklyRateAbs uses (anchored to latest entry, not today)
    const lookbackStartMs = latestEntry.dateMs - this.weeklyRateLookbackDays * 86400000;
    const samples = entriesAfterGoalStart.filter(e => e.dateMs >= lookbackStartMs);

    if (samples.length < 2) return null;

    // Slope stops reflecting current behavior after several days without data
    const isStale = (todayMs - latestEntry.dateMs) / 86400000 > 6;

    // Entries must span at least half the lookback window for a stable slope
    const spanDays = (samples[samples.length - 1].dateMs - samples[0].dateMs) / 86400000;
    const hasMinSpan = spanDays >= 6;

    // A >7-day gap means the regression bridges a data desert
    const hasLargeGap = samples.some((entry, i) => {
      if (i === 0) return false;
      return (entry.dateMs - samples[i - 1].dateMs) / 86400000 > 7;
    });

    // 2 points is the mathematical minimum; 4+ gives a meaningful fit
    const hasEnoughPoints = samples.length >= 4;

    return hasEnoughPoints && hasMinSpan && !hasLargeGap && !isStale ? null : 'Rough estimates';
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
    return `${sign}${formatWeight(weeklyRate, unitLabel, 1)} ${unitLabel}/week`;
  }

  private goalReached(trendToFixed: string | null, activeGoal: Goal | null): boolean {
    if (!activeGoal || trendToFixed == null) return false;
    const trendValue = parseFloat(trendToFixed);
    const { goalWeight, type: goalType } = activeGoal;
    const reachedGoal =
      goalWeight != null &&
      ((goalType === 'Weight Loss' && trendValue <= goalWeight) || (goalType === 'Weight Gain' && trendValue >= goalWeight));
    return reachedGoal;
  }

  private scheduleProjection(
    trendWeight: number | null,
    activeGoal: Goal | null,
    userSettings: UserSettingsExtended | null,
  ): { projectedWeight: number; range: number } | null {
    if (!trendWeight || !activeGoal || activeGoal.type === 'Maintenance' || !userSettings?.coaching) {
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
    const {
      scheduleToleranceWeeks = 2.0,
      rangeCap = kgToUnit(2.0, userSettings.weightUnit),
      noiseFloor = kgToUnit(0.5, userSettings.weightUnit),
    } = userSettings?.coaching ?? {};
    const range = Math.min(Math.max(Math.abs(delta / totalDays) * scheduleToleranceWeeks * 7, noiseFloor), rangeCap);

    console.log('Schedule projection:', { projectedWeight, range });
    return { projectedWeight, range };
  }

  /**
   * Count consecutive weeks (looking backward from today) where the trend
   * has not moved meaningfully toward the goal. A week is "stalled" when
   * the absolute trend change over that 7-day window is <= noiseFloorPct.
   */
  private stallWeeks(entriesAfterGoalStart: WeightEntry[], activeGoal: Goal | null, userSettings: UserSettingsExtended | null): number {
    if (!activeGoal || entriesAfterGoalStart.length < 2 || !userSettings || activeGoal.type === 'Maintenance') return 0;

    const today = todayLocalMidnightMs();
    const fourWeeksMaxEntries = entriesAfterGoalStart.filter(e => e.dateMs > today - 4 * 7 * 86400000);

    const noiseFloorPct =
      activeGoal.type === 'Weight Gain' ? userSettings.coaching.idealGainFloorPct : userSettings.coaching.idealLossFloorPct;
    const msPerWeek = 7 * 86400000;
    let weeks = 0;

    // Walk backward week by week starting from today
    for (let weekEnd = today; ; weekEnd -= msPerWeek) {
      const weekStart = weekEnd - msPerWeek;

      // Find the entry closest to weekEnd and weekStart
      const endEntry = this.closestEntry(fourWeeksMaxEntries, weekEnd);
      const startEntry = this.closestEntry(fourWeeksMaxEntries, weekStart);

      // Stop if we can't find entries spanning at least half a week
      if (!endEntry || !startEntry || endEntry === startEntry) break;
      if (Math.abs(endEntry.dateMs - startEntry.dateMs) < 3 * 86400000) break;

      const trendDelta = Math.abs(endEntry.trend - startEntry.trend);
      const thresholdAbs = (endEntry.trend * noiseFloorPct) / 100;
      console.log('Stall week check - trendDelta:', trendDelta, 'thresholdAbs:', thresholdAbs);
      if (trendDelta > thresholdAbs) break; // meaningful movement → not stalled

      weeks++;
      if (weekStart <= activeGoal.startDateMs) break; // don't look before goal start
    }

    console.log('Stall weeks calculated:', weeks);
    return weeks;
  }

  private outOfRangeStreakWeeks(entriesAfterGoalStart: WeightEntry[], activeGoal: Goal | null, maintRange: number | null): number {
    if (entriesAfterGoalStart.length < 2 || !activeGoal || !maintRange || maintRange <= 0 || activeGoal.type !== 'Maintenance') return 0;

    const latest = entriesAfterGoalStart[entriesAfterGoalStart.length - 1];
    if (Math.abs(latest.trend - activeGoal.goalWeight) <= maintRange) return 0;

    let streakStartIndex = entriesAfterGoalStart.length - 1;
    for (let i = entriesAfterGoalStart.length - 1; i >= 0; i--) {
      if (Math.abs(entriesAfterGoalStart[i].trend - activeGoal.goalWeight) <= maintRange) break;
      streakStartIndex = i;
    }

    const outOfRangeDays = Math.max(0, Math.round((todayLocalMidnightMs() - entriesAfterGoalStart[streakStartIndex].dateMs) / 86400000));
    console.log('Maintenance out-of-range days calculated:', outOfRangeDays);
    return Math.floor(outOfRangeDays / 7);
  }

  private closestEntry(entries: WeightEntry[], targetMs: number): WeightEntry | null {
    if (!entries.length) return null;
    return entries.reduce((best, e) => (Math.abs(e.dateMs - targetMs) < Math.abs(best.dateMs - targetMs) ? e : best));
  }

  private recommendation(
    trendWeight: number | null,
    rawWeeklyRate: number | null,
    activeGoal: Goal | null,
    stabilityScore: number | null,
    userSettings: UserSettingsExtended | null,
    idealCurrentWeight: { projectedWeight: number; range: number } | null,
    goalReached: boolean,
    stallWeeks: number,
    maintenanceOutOfRangeWeeks: number,
  ): string {
    if (!activeGoal) {
      return 'Set a new goal to receive personalized recommendations.';
    }
    if (trendWeight == null || rawWeeklyRate == null || userSettings == null) {
      return 'Log weight at least 2 times to unlock custom recommendations.';
    }

    const goalWeight = activeGoal.goalWeight;
    const goalType = activeGoal.type;

    // prettier-ignore
    const { maxLossRate, idealLossFloorPct, steadyLossFloorPct, idealGainFloorPct, idealGainCeilingPct, deficitStep, surplusStep, minorDeficitStep, minorSurplusStep, maintMinorStep, maintMajorCut, maintMajorAdd, customAdvice, maintRange } = userSettings.coaching;

    const bwPct = Math.abs((rawWeeklyRate / trendWeight) * 100);
    const isGaining = rawWeeklyRate > 0.01;
    const isLosing = rawWeeklyRate < -0.01;

    let scheduleStatus: 'ahead' | 'behind' | 'on-track' | null = null;
    let offTrack = false;
    let scheduleLabel = '';
    if (idealCurrentWeight) {
      const deviation = Math.abs(trendWeight - idealCurrentWeight.projectedWeight);
      const warnRange = idealCurrentWeight.range / 1.5; // Use 2/3 of the range as the threshold for being "on-track"
      if (idealCurrentWeight.range > 0 && deviation > warnRange) {
        offTrack = deviation > idealCurrentWeight.range;
        if (goalType === 'Weight Loss') {
          if (trendWeight < idealCurrentWeight.projectedWeight) {
            scheduleStatus = 'ahead';
            scheduleLabel = offTrack ? 'ahead of' : 'drifting ahead of';
          } else {
            scheduleStatus = 'behind';
            scheduleLabel = offTrack ? 'behind' : 'falling behind';
          }
        } else {
          if (trendWeight > idealCurrentWeight.projectedWeight) {
            scheduleStatus = 'ahead';
            scheduleLabel = offTrack ? 'ahead of' : 'drifting ahead of';
          } else {
            scheduleStatus = 'behind';
            scheduleLabel = offTrack ? 'behind' : 'falling behind';
          }
        }
      } else {
        scheduleStatus = 'on-track';
      }
    }

    if (goalReached) {
      return 'You have reached your goal weight! Consider setting a maintenance or new target.';
    }

    switch (goalType) {
      case 'Weight Loss': {
        const nearLossGoal = goalWeight != null && goalWeight > 0 && (trendWeight - goalWeight) / goalWeight < 0.01;

        // 1. Moving Backwards
        if (isGaining) {
          if (scheduleStatus === 'behind') {
            return (
              `Weight is trending up and you're ${scheduleLabel} schedule. Re-evaluate intake urgently — track every meal for a few days.` +
              customAdvice
            );
          }
          return (
            'Weight is trending up while in a loss phase. Re-evaluate intake — track a few days to find hidden calories.' + customAdvice
          );
        }

        // 2. Too Fast
        if (bwPct > maxLossRate) {
          if (nearLossGoal) {
            return `You are practically at your goal! Since you're moving very fast, you can start adding back a few calories now to ease smoothly into maintenance.`;
          }
          if (scheduleStatus === 'ahead') {
            return `Loss rate exceeds ${maxLossRate}% BW/week and you're ${scheduleLabel} schedule. Ease off slightly — you can afford to slow down and preserve lean mass.`;
          }
          return (
            `Loss rate exceeds ${maxLossRate}% BW/week. Slow down slightly to preserve lean mass and training performance.` + customAdvice
          );
        }

        // 3. Ideal Range
        if (bwPct >= idealLossFloorPct) {
          if (nearLossGoal) {
            return 'Almost at your goal and losing at a perfect pace! Finish strong — no changes needed.';
          }
          if (scheduleStatus === 'behind') {
            return `Loss rate is in an ideal range. You're ${scheduleLabel} schedule, but cutting more calories now risks muscle loss and fatigue. Stay the course.`;
          }
          return 'Rate is in an ideal range for fat loss. Maintain current calories and activity.';
        }

        // 4. Steady / Slightly Slow
        if (bwPct >= steadyLossFloorPct) {
          if (nearLossGoal) {
            return `You're incredibly close to your goal! Just a tiny final push — trim ~${minorDeficitStep} kcal or add a short walk — will get you across the finish line.`;
          }
          if (stallWeeks >= 3) {
            return 'Progress has been slow for a while. If diet fatigue is setting in, consider switching to a Maintenance goal for a planned break — then restart with fresh momentum.';
          }
          if (stallWeeks >= 2) {
            return 'Progress has been sluggish for two weeks now. Common culprits: larger weekend portions, liquid calories you forgot about, or less movement than usual. Try swapping one snack or cutting a sugary drink.';
          }
          if (scheduleStatus === 'behind') {
            return (
              `Losing steadily but ${scheduleLabel} schedule. Consider increasing your deficit by ~${deficitStep} kcal to catch up.` +
              customAdvice
            );
          }
          return `Losing steadily. If progress stalls, a small nudge — trim ~${minorDeficitStep} kcal or add ~1,500 daily steps — can help.`;
        }

        // 5. Very Slow
        if (isLosing) {
          if (nearLossGoal) {
            return `You're incredibly close to your goal! Progress has slowed, but a tiny final push — trim ~${minorDeficitStep} kcal or add a short walk — will close the gap.`;
          }
          if (stallWeeks >= 3) {
            return 'Progress has been minimal for several weeks. If motivation is fading, consider a short Maintenance phase to reset — a structured break beats burnout.';
          }
          if (stallWeeks >= 2) {
            return 'Still losing, but barely. This pattern has persisted for two weeks — look for easy wins: cut a liquid calorie, reduce cooking oil by a tablespoon, or add a 15-min daily walk.';
          }
          if (scheduleStatus === 'behind') {
            return (
              `Progress is slow and you're ${scheduleLabel} schedule. Try reducing intake by ~${deficitStep} kcal or adding 2,000–3,000 daily steps to get back on track.` +
              customAdvice
            );
          }
          return (
            `Progress is slower than optimal. Try reducing intake by ~${minorDeficitStep} kcal or adding ~1,500 daily steps.` + customAdvice
          );
        }

        // 6. Flat / Stalled
        if (nearLossGoal) {
          return `You're incredibly close to your goal! Progress has paused, but a tiny final push — cut ~${minorDeficitStep} kcal or take a short walk — will get you across the finish line.`;
        }
        if (stallWeeks >= 3) {
          return 'Weight has been flat for 3+ weeks. Repeating the same approach is unlikely to break through. Consider a Maintenance phase to recover, then restart your deficit with a fresh plan.';
        }
        if (stallWeeks >= 2) {
          return "Weight hasn't budged in two weeks. Look for sneaky extras — cooking oils, sauces, weekend portions, or that extra handful of snacks. Cutting one of these is often enough to restart progress.";
        }
        if (scheduleStatus === 'behind') {
          return (
            `Weight is flat and you're ${scheduleLabel} schedule. Create a deficit now — cut ~${deficitStep} kcal or add ~2,000 daily steps to get things moving.` +
            customAdvice
          );
        }
        return (
          `Weight is flat. Create a modest deficit — cut ~${minorDeficitStep} kcal or add ~1,500 daily steps to get things moving.` +
          customAdvice
        );
      }

      case 'Weight Gain': {
        const nearGainGoal = goalWeight != null && goalWeight > 0 && (goalWeight - trendWeight) / goalWeight < 0.005;

        // 1. Moving Backwards
        if (isLosing) {
          if (scheduleStatus === 'behind') {
            return (
              `Weight is dropping and you're ${scheduleLabel} schedule. Increase calories significantly — add ~${surplusStep + 100} kcal (e.g., 2 snacks or a dense shake) daily.` +
              customAdvice
            );
          }
          return 'Weight is dropping during a gain phase. Increase calories — add a snack or larger portion to one meal.' + customAdvice;
        }

        // 2. Above Ceiling (Gaining Too Fast)
        if (bwPct > idealGainCeilingPct) {
          if (nearGainGoal) {
            return `You are practically at your goal! Since your gain rate is above your target ceiling (${idealGainCeilingPct}% BW/week), start trimming your surplus now to ease into maintenance.`;
          }
          if (scheduleStatus === 'ahead') {
            return `Gaining faster than your target ceiling (${idealGainCeilingPct}% BW/week) and ${scheduleLabel} schedule. Pull back surplus by ~${surplusStep} kcal — no need to add excess fat.`;
          }
          return (
            `Gain rate of ${bwPct.toFixed(2)}% BW/week exceeds your optimal ceiling (${idealGainCeilingPct}%). Excess weight is likely fat accumulation — pull back surplus by ~${minorSurplusStep} kcal.` +
            customAdvice
          );
        }

        // 3. Optimal Lean-Gain Band
        if (bwPct >= idealGainFloorPct) {
          if (nearGainGoal) {
            return 'Almost at your goal with an optimal lean-gain pace! Keep going, no changes needed.';
          }
          if (scheduleStatus === 'behind') {
            return `Lean-gain pace is biologically optimal. You're ${scheduleLabel} your calendar target, but adding calories now risks unnecessary fat gain. Stay the course.`;
          }
          return 'Lean-gain pace is on track. Keep training hard and calories consistent.';
        }

        // 4. Slow
        if (isGaining) {
          if (nearGainGoal) {
            return `Nearly at your goal but progress has slowed. A small nudge — add ~${minorSurplusStep} kcal or a calorie-dense snack — should close the gap.`;
          }
          if (stallWeeks >= 3) {
            return 'Gains have been minimal for several weeks. If appetite is the bottleneck, try calorie-dense liquids (shakes, smoothies) or eating more frequently rather than bigger meals.';
          }
          if (stallWeeks >= 2) {
            return 'Gaining very slowly for two weeks running. Make sure you are not skipping meals on busy days — try adding a snack or a calorie-dense shake to fill the gap without forcing bigger meals.';
          }
          if (scheduleStatus === 'behind') {
            return (
              `Gaining slowly and ${scheduleLabel} schedule. Add ~${surplusStep} kcal from protein or carbs to get back on track.` +
              customAdvice
            );
          }
          return (
            `Gaining slowly. If strength is not progressing, try adding ~${minorSurplusStep} kcal from protein or carbs.` + customAdvice
          );
        }

        // 5. Flat / Stalled
        if (nearGainGoal) {
          return `Nearly at your goal but progress has stalled. A small nudge — add ~${minorSurplusStep} kcal or a calorie-dense snack — should close the gap.`;
        }
        if (stallWeeks >= 3) {
          return 'Weight has been flat for 3+ weeks during a gain phase. If eating more feels unsustainable, consider switching to a Maintenance goal — holding your current weight is still progress.';
        }
        if (stallWeeks >= 2) {
          return "Scale hasn't moved in two weeks. Try adding an easy calorie source you won't skip — a handful of nuts, a glass of whole milk, or a peanut butter toast.";
        }
        if (scheduleStatus === 'behind') {
          return (
            `Weight is flat and you're ${scheduleLabel} schedule. Increase intake by ~${surplusStep}–${surplusStep + 100} kcal — calorie-dense foods help.` +
            customAdvice
          );
        }
        return (
          `Weight is flat. Increase intake — an extra ~${minorSurplusStep}–${minorSurplusStep + 50} kcal should move the scale.` +
          customAdvice
        );
      }

      // prettier-ignore
      case 'Maintenance': {
        if (goalWeight == null || maintRange == null || maintRange <= 0) {
          return 'No target weight set for maintenance. Keep logging to maintain current trends or set a clear goal.';
        }

        const offset = trendWeight - goalWeight;
        const absOffset = Math.abs(offset);
        
        // Use 2/3 of the allowed range as the "early warning" threshold
        const warnThreshold = maintRange * (2 / 3);
        const isAbove = offset > warnThreshold;
        const isBelow = offset < -warnThreshold;
        const onTarget = !isAbove && !isBelow;

        // True Out-of-Range breach
        const isOutOfRange = absOffset > maintRange;

        const movingAway = (isAbove && isGaining) || (isBelow && isLosing);
        const movingToward = (isAbove && isLosing) || (isBelow && isGaining);

        const noData = stabilityScore == null;
        const stable = !noData && stabilityScore >= 75;
        const moderate = !noData && stabilityScore >= 50 && stabilityScore < 75;
        const fluctuating = !noData && stabilityScore < 50;
        
        // --- 1. BOUNDARY BREACH (Out of Range) ---
        // Address absolute deviations first, regardless of speed
        if (isOutOfRange) {
          // --- Persistent drift escalation (maintenance) ---
          if (!movingToward && maintenanceOutOfRangeWeeks >= 3) {
            return isAbove
              ? 'Weight has sat above your target for 3+ weeks. Your maintenance calories may have shifted — consider recalculating your baseline or adjusting your target weight to match your current lifestyle.'
              : 'Weight has sat below your target for 3+ weeks. Your maintenance calories may have shifted — consider recalculating your baseline or adjusting your target weight to match your current lifestyle.';
          }
          if (!movingToward && maintenanceOutOfRangeWeeks >= 2) {
            return isAbove
              ? 'Weight has been stuck above target for two weeks. Before making calorie cuts, check for consistency gaps — weekend eating, alcohol, or stress-related snacking may be the culprit.'
              : 'Weight has been stuck below target for two weeks. Check whether you are consistently eating enough — skipped meals, busy days, or underfueling around workouts may be holding you back.';
          }
          // --- Out of range for less than 2 weeks ---
          if (movingToward) {
            return isAbove
              ? 'Weight is outside your target zone but successfully heading back down. Stay the course — no drastic changes needed until you are back in range.'
              : 'Weight is outside your target zone but successfully heading back up. Stay the course — no drastic changes needed until you are back in range.';
          }
          if (movingAway) {
            return isAbove
              ? `Weight has breached your upper limit and is still climbing. Cut ~${maintMajorCut} kcal and add daily steps to aggressively reverse the trend.`
              : `Weight has breached your lower limit and is still falling. Add ~${maintMajorAdd} kcal immediately to halt the loss and reverse the trend.`;
          }
          if (isAbove) {
            return fluctuating
              ? 'Weight is fluctuating outside your upper limit. Focus on strict dietary consistency for a few days before making large calorie cuts.'
              : `Weight has settled outside your maintenance zone. Cut ~${maintMajorCut} kcal to return to your range.`;
          }
          if (isBelow) {
            return fluctuating
              ? 'Weight is fluctuating outside your lower limit. Focus on regular, structured meals before blindly adding calories.'
              : `Weight has settled outside your maintenance zone. Add ~${maintMajorAdd} kcal — a daily snack or slightly larger portions — to return to your range.`;
          }
        }

        // --- 2. IN-RANGE, HIGH DRIFT (>0.5% BW/week) ---
        if (bwPct > 0.5) {
          if (movingAway) {
            return isGaining
              ? `Drifting rapidly toward your upper limit. Cut ~${maintMajorCut} kcal or add ~2,500 daily steps to correct course before you breach the zone.`
              : `Drifting rapidly toward your lower limit. Add ~${maintMajorAdd} kcal — an extra meal or calorie-dense snack — to stabilize.`;
          }
          if (movingToward) {
            return isGaining
              ? "Correcting quickly upward toward target. Good progress, but ease off soon so you don't overshoot."
              : "Correcting quickly downward toward target. Good progress, but ease off soon so you don't overshoot.";
          }
          if (onTarget) {
            if (fluctuating) {
              return 'Weight is right on target but swinging rapidly. Focus on strict hydration and sodium consistency.';
            }
            return isGaining
              ? `Weight is near target but trending up quickly. Trim ~${maintMajorCut} kcal now to prevent a larger correction later.`
              : `Weight is near target but trending down quickly. Add ~${maintMajorAdd} kcal to avoid drifting below range.`;
          }
        }

        // --- 3. IN-RANGE, MODERATE DRIFT (0.2–0.5% BW/week) ---
        if (bwPct > 0.2) {
          if (movingAway) {
            if (fluctuating) {
              return isGaining
                ? 'Drifting upward with high variability. Tighten up meal consistency and watch sodium intake.'
                : 'Drifting downward with high variability. Ensure consistent meal timing and adequate calories.';
            }
            return isGaining
              ? `Slowly trending toward the top of your range. Trim ~${maintMinorStep} kcal — like skipping a liquid calorie or adding a short walk — to level off.`
              : `Slowly trending toward the bottom of your range. Add ~${maintMinorStep} kcal — a small snack or slightly larger portion — to support recovery.`;
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
              ? `Near target with a slight upward drift. A ~${maintMinorStep} kcal trim or ~1,500 extra steps this week should level it off.`
              : `Near target with a slight downward drift. Add ~${maintMinorStep} kcal — a small snack — to level off.`;
          }
        }

        // --- Low drift (<=0.2% BW/week) ---
        if (fluctuating) {
          return 'Weight is fluctuating near target. Review sodium, sleep, and stress — these often drive short-term swings.';
        }

        if (stable) {
          if (onTarget) return 'Excellent stability right on target. Maintain your current routine.';
          if (isAbove) return `Weight is stable but sitting near the top edge of your range. Trim ~${maintMinorStep} kcal to realign it.`;
          if (isBelow) return `Weight is stable but sitting near the bottom edge of your range. Add ~${maintMinorStep} kcal to realign it.`;
        }

        if (moderate) {
          if (onTarget) return 'Good stability near target. Minor day-to-day fluctuations are normal — stay the course.';
          if (isAbove) return `Moderate stability, slowly nearing the top edge of your range. Keep meal timing consistent and trim ~${maintMinorStep} kcal.`;
          if (isBelow) return `Moderate stability, slowly nearing the bottom edge of your range. Keep meal timing consistent and add ~${maintMinorStep} kcal.`;
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
