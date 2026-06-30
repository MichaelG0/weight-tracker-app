import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { IonHeader, IonToolbar, IonContent, IonIcon, IonList, IonItem, IonLabel, IonNote, IonCard, IonCardContent, IonBadge, IonProgressBar, IonButton, IonGrid, IonRow, IonCol } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { trendingDownOutline } from 'ionicons/icons';
import { DatabaseService, WeightEntry } from 'src/app/services/database.service';

interface DashboardVm {
  currentWeight: number | null;
  avg7d: number | null;
  weeklyRate: number | null;
  trend30d: number | null;
  goalWeight: number | null;
  startWeight: number | null;
  progressPercent: number | null;
  expectedGoalDate: string | null;
  consistency: string;
  recommendation: string;
  rateLabel: string;
  recentEntries: Array<{ label: string; weight: number }>;
}

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  imports: [CommonModule, RouterLink, IonHeader, IonToolbar, IonContent, IonIcon, IonList, IonItem, IonLabel, IonNote, IonCard, IonCardContent, IonBadge, IonProgressBar, IonButton, IonGrid, IonRow, IonCol],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Tab1Page {
  private readonly databaseService = inject(DatabaseService);

  private readonly entries = toSignal(this.databaseService.entries$, { initialValue: [] });
  private readonly settings = toSignal(this.databaseService.settings$, { initialValue: null });

  readonly vm = computed(() => {
    const entries = this.entries();
    const settings = this.settings();
    const sorted = [...entries].sort(
      (a, b) => +new Date(b.logged_at) - +new Date(a.logged_at)
    );

    const currentWeight = sorted[0]?.weight_kg ?? null;
    const startWeight = sorted.length
      ? sorted[sorted.length - 1].weight_kg
      : null;
    const goalWeight = settings?.goal_weight_kg ?? null;

    const avg7d = this.averageInWindow(sorted, 7);
    const trend30d = this.netChangeInWindow(sorted, 30);
    const weeklyRate = this.weeklyRate(sorted, 30);
    const progressPercent = this.progressPercent(startWeight, currentWeight, goalWeight);
    const expectedGoalDate = this.expectedGoalDate(currentWeight, goalWeight, weeklyRate);
    const consistency = this.consistencyLabel(sorted);

    return {
      currentWeight,
      avg7d,
      weeklyRate,
      trend30d,
      goalWeight,
      startWeight,
      progressPercent,
      expectedGoalDate,
      consistency,
      recommendation: this.recommendation(currentWeight, weeklyRate),
      rateLabel: this.rateLabel(weeklyRate),
      recentEntries: this.recentEntries(sorted),
    } as DashboardVm;
  });

  constructor() {
    addIcons({ trendingDownOutline });
  }

  private recentEntries(entries: WeightEntry[]): Array<{ label: string; weight: number }> {
    return entries.slice(0, 3).map((entry, index) => ({
      label: this.entryLabel(entry.logged_at, index),
      weight: entry.weight_kg,
    }));
  }

  private entryLabel(isoDate: string, index: number): string {
    if (index === 0) {
      return 'Today';
    }
    if (index === 1) {
      return 'Previous';
    }

    return new Date(isoDate).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
    });
  }

  private averageInWindow(entries: WeightEntry[], days: number): number | null {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const inWindow = entries.filter(e => new Date(e.logged_at) >= cutoff);

    if (!inWindow.length) {
      return null;
    }

    const total = inWindow.reduce((sum, e) => sum + e.weight_kg, 0);
    return total / inWindow.length;
  }

  private netChangeInWindow(entries: WeightEntry[], days: number): number | null {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const inWindow = entries
      .filter(e => new Date(e.logged_at) >= cutoff)
      .sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at));

    if (inWindow.length < 2) {
      return null;
    }

    return inWindow[inWindow.length - 1].weight_kg - inWindow[0].weight_kg;
  }

  private weeklyRate(entries: WeightEntry[], days: number): number | null {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const inWindow = entries
      .filter(e => new Date(e.logged_at) >= cutoff)
      .sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at));

    if (inWindow.length < 2) {
      return null;
    }

    const first = inWindow[0];
    const last = inWindow[inWindow.length - 1];
    const elapsedDays = Math.max(
      1,
      Math.round((+new Date(last.logged_at) - +new Date(first.logged_at)) / 86400000)
    );

    return ((last.weight_kg - first.weight_kg) / elapsedDays) * 7;
  }

  private progressPercent(
    startWeight: number | null,
    currentWeight: number | null,
    goalWeight: number | null
  ): number | null {
    if (startWeight == null || currentWeight == null || goalWeight == null) {
      return null;
    }

    const totalDelta = goalWeight - startWeight;
    if (Math.abs(totalDelta) < 0.001) {
      return 100;
    }

    const progressed = currentWeight - startWeight;
    const pct = (progressed / totalDelta) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  private expectedGoalDate(
    currentWeight: number | null,
    goalWeight: number | null,
    weeklyRate: number | null
  ): string | null {
    if (currentWeight == null || goalWeight == null || weeklyRate == null) {
      return null;
    }

    const remaining = goalWeight - currentWeight;
    if (Math.abs(remaining) < 0.01) {
      return 'Reached';
    }

    if (Math.abs(weeklyRate) < 0.01) {
      return null;
    }

    if (Math.sign(remaining) !== Math.sign(weeklyRate)) {
      return null;
    }

    const weeks = Math.abs(remaining / weeklyRate);
    const days = Math.ceil(weeks * 7);
    const goalDate = new Date();
    goalDate.setDate(goalDate.getDate() + days);

    return goalDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private consistencyLabel(entries: WeightEntry[]): string {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const weeklyEntries = entries.filter(e => new Date(e.logged_at) >= cutoff);
    return `${weeklyEntries.length} / 7 check-ins`;
  }

  private rateLabel(weeklyRate: number | null): string {
    if (weeklyRate == null) {
      return 'Need more data';
    }
    const sign = weeklyRate > 0 ? '+' : '';
    return `${sign}${weeklyRate.toFixed(2)} kg/week`;
  }

  private recommendation(currentWeight: number | null, weeklyRate: number | null): string {
    if (currentWeight == null || weeklyRate == null) {
      return 'Log weight at least 3 times this week to unlock recommendations.';
    }

    const bwRatePercent = Math.abs((weeklyRate / currentWeight) * 100);
    if (bwRatePercent > 1.0) {
      return 'Loss rate is high. Consider eating slightly more to protect recovery and lean mass.';
    }

    if (bwRatePercent < 0.25) {
      return 'Progress is slower than target. Try a small calorie reduction or increase daily steps.';
    }

    return 'Current trend is in a sustainable range. Keep calories and training consistent this week.';
  }
}
