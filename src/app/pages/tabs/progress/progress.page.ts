import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonIcon,
  IonPopover,
  IonSegment,
  IonSegmentButton,
  IonCard,
  IonCardContent,
  IonChip,
  IonLabel,
  IonButton,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, informationCircleOutline, flagOutline, addOutline, trashOutline } from 'ionicons/icons';
import { SetGoalModalComponent } from 'src/app/components/set-goal-modal/set-goal-modal.component';
import { DeckCardOptionsDirective } from 'src/app/directives/deck-card-options.directive';
import { take } from 'rxjs/operators';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import { CssThemeService } from 'src/app/services/css-theme.service';
import { DatabaseService, Goal, WeightEntry, WeightUnit } from 'src/app/services/database.service';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { formatWeight, kgToUnit } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightDate } from 'src/app/utils/date-converter.util';
import { FormatDatePipe } from '../../../pipes/format-date.pipe';

import 'hammerjs';
import { FormatWeightPipe } from '../../../pipes/format-weight.pipe';
Chart.register(zoomPlugin);

type RangeMode = 'journey' | 'month' | 'to-goal' | 'history';
interface Pt {
  x: number;
  y: number;
}

interface ViewportState {
  xMin: number;
  xMax: number;
}

interface ChartColors {
  guideLine: string;
  guideBand: string;
  scaleLine: string;
  scaleDot: string;
  scaleDotHover: string;
  scaleDotBorder: string;
  scaleDotBorderHover: string;
  trendLine: string;
  trendBand: string;
  trendDotHover: string;
  trendDotBorderHover: string;
  axisGrid: string;
  axisBorder: string;
  axisTick: string;
}

@Component({
  selector: 'app-progress',
  templateUrl: 'progress.page.html',
  styleUrls: ['progress.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonIcon,
    IonPopover,
    IonSegment,
    IonSegmentButton,
    IonCard,
    IonCardContent,
    IonChip,
    IonLabel,
    IonButton,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    DeckCardOptionsDirective,
    GlassHeaderBackdropDirective,
    FormatDatePipe,
    FormatWeightPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressPage {
  private readonly db = inject(DatabaseService);
  private readonly cssTheme = inject(CssThemeService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  readonly weightChart = viewChild<ElementRef>('weightChart');

  readonly rangeMode = signal<RangeMode>((localStorage.getItem('progress.rangeMode') as RangeMode) || 'journey');
  readonly showDaily = signal<boolean>(localStorage.getItem('progress.showDaily') !== 'false');
  readonly showTrend = signal<boolean>(localStorage.getItem('progress.showTrend') !== 'false');

  readonly allEntries = this.db.entries;
  readonly goals = this.db.goals;
  readonly weightUnit = this.db.weightUnit;
  readonly activeGoal = this.db.activeGoal;
  readonly selectedDateMs = signal<number | null>(null);

  readonly selectedEntry = computed(() => {
    const entries = this.allEntries();
    if (!entries.length) return null;

    const selMs = this.selectedDateMs();
    if (selMs == null) return entries[entries.length - 1]; // default: latest

    // Find the entry closest to the selected x position
    let closest = entries[0];
    let minDiff = Math.abs(closest.dateMs - selMs);
    for (const e of entries) {
      const diff = Math.abs(e.dateMs - selMs);
      if (diff < minDiff) {
        minDiff = diff;
        closest = e;
      }
    }
    return closest;
  });

  private chart: Chart | null = null;
  private pendingViewport: ViewportState | null = null;

  constructor() {
    addIcons({ analyticsOutline, informationCircleOutline, flagOutline, addOutline, trashOutline });

    effect(() => {
      const allEntries = this.allEntries();
      const goals = this.goals();
      const activeOrLastPastGoal = this.db.activeOrLastPastGoal();
      const range = this.rangeMode();
      const showDaily = this.showDaily();
      const showTrend = this.showTrend();
      const unitLbl = this.weightUnit();
      const today = todayLocalMidnightDate();
      const todayMs = today.getTime();
      this.cssTheme.isDarkMode(); // Trigger re-render on theme change
      const canvas = this.weightChart()?.nativeElement as HTMLCanvasElement;

      // Filter entries and goals: cut off before the most recent goal's start date (unless 'history')
      let filteredEntries = allEntries;
      let filteredGoals = goals;
      if (range !== 'history' && activeOrLastPastGoal) {
        const cutoff = activeOrLastPastGoal.startDateMs;
        filteredEntries = allEntries.filter(e => e.dateMs >= cutoff);
        filteredGoals = goals.filter(g => g.startDateMs >= cutoff);
      }

      if (!canvas || (filteredEntries.length === 0 && filteredGoals.length === 0)) {
        this.destroyChart();
        return;
      }

      this.renderChart(canvas, filteredEntries, filteredGoals, range, showDaily, showTrend, unitLbl, today, todayMs);
    });
  }

  setRange(range: RangeMode): void {
    localStorage.setItem('progress.rangeMode', range);
    this.rangeMode.set(range);
  }

  // ── Goal management ─────────────────────────────────────────────────────────

  async openSetGoal(goal?: Goal): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SetGoalModalComponent,
      componentProps: { goal },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();
  }

  async deleteGoal(goal: Goal): Promise<void> {
    this.db.deleteGoal(goal.id).pipe(take(1)).subscribe();

    const toast = await this.toastCtrl.create({
      message: 'Goal deleted',
      duration: 5000,
      swipeGesture: 'vertical',
      position: 'bottom',
      buttons: [
        {
          text: 'Undo',
          role: 'cancel',
          handler: () => {
            this.db
              .addGoal({
                start_weight_kg: goal.startWeight,
                goal_weight_kg: goal.goalWeight,
                start_date: goal.startDate,
                goal_date: goal.goalDate,
                type: goal.type,
              })
              .pipe(take(1))
              .subscribe();
          },
        },
      ],
    });

    await toast.present();
  }

  toggleShowDaily(): void {
    this.pendingViewport = this.getCurrentViewport();
    this.showDaily.update(v => {
      localStorage.setItem('progress.showDaily', String(!v));
      return !v;
    });
  }

  toggleShowTrend(): void {
    this.pendingViewport = this.getCurrentViewport();
    this.showTrend.update(v => {
      localStorage.setItem('progress.showTrend', String(!v));
      return !v;
    });
  }

  // ── Chart rendering ────────────────────────────────────────────────────────

  private destroyChart(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private renderChart(
    canvas: HTMLCanvasElement,
    entries: WeightEntry[],
    goals: Goal[],
    range: RangeMode,
    showDaily: boolean,
    showTrend: boolean,
    unitLbl: WeightUnit,
    today: Date,
    todayMs: number,
  ): void {
    const colors: ChartColors = this.getChartColors();

    const dots: Pt[] = entries.map(e => ({ x: e.dateMs, y: e.weight }));
    const trendLine: Pt[] = this.getTrendLine(entries);
    const maintRange = kgToUnit(0.907186, unitLbl);
    const guideDatasets = this.buildGuideDatasets(goals, colors, maintRange);
    const bounds = this.getBounds(entries, goals, range, maintRange, unitLbl, todayMs);

    const earliestEntryMs = entries.length > 0 ? entries[0].dateMs : Infinity;
    const latestEntryMs = entries.length > 0 ? entries[entries.length - 1].dateMs : 0;
    const activeOrLastPastGoalStartMs = goals.length > 0 ? goals[0].startDateMs : Infinity;
    const latestGoalEndMs = goals.length > 0 ? Math.max(...goals.map(g => g.goalDateMs)) : 0;
    const monthMinMs = range === 'month' ? todayMs - 30 * 86400000 : Infinity;
    const xMinLimit = Math.min(earliestEntryMs, activeOrLastPastGoalStartMs, monthMinMs);
    const xMaxLimit = Math.max(latestEntryMs, latestGoalEndMs, todayMs);

    const config = {
      type: 'line',
      data: {
        datasets: [
          ...guideDatasets,
          ...(showDaily
            ? [
                {
                  // ── Scale weight line with dots
                  label: 'Scale',
                  data: dots,
                  borderColor: colors['scaleLine'],
                  backgroundColor: colors['scaleDot'],
                  borderWidth: 2.5,
                  borderDash: [2, 3],
                  pointRadius: 3,
                  pointHitRadius: 26,
                  pointHoverRadius: 5,
                  pointBorderColor: colors['scaleDotBorder'],
                  pointBorderWidth: 2,
                  hoverBackgroundColor: colors['scaleDotHover'],
                  hoverBorderColor: colors['scaleDotBorderHover'],
                  hoverBorderWidth: 2,
                  tension: 0,
                  fill: false,
                  clip: { left: 7, top: false, right: false, bottom: false },
                  order: 2,
                } as any,
              ]
            : []),
          ...(showTrend
            ? [
                {
                  // ── Hacker's Diet trend curve
                  label: 'Trend',
                  data: trendLine,
                  borderColor: colors['trendLine'],
                  borderWidth: 3,
                  pointRadius: 0,
                  pointHoverRadius: 5,
                  hoverBackgroundColor: colors['trendDotHover'],
                  hoverBorderColor: colors['trendDotBorderHover'],
                  hoverBorderWidth: 2,
                  tension: 0.35,
                  fill: true,
                  backgroundColor: colors['trendBand'],
                  clip: { left: 7, top: false, right: false, bottom: false },
                  order: 1,
                } as any,
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false,
        },
        onClick: (evt: any, _elements: any, chart: any) => this.handleChartInteraction(evt, chart),
        onHover: (evt: any, _elements: any, chart: any) => {
          if (evt.type === 'mouseout') return;
          this.handleChartInteraction(evt, chart);
        },
        scales: {
          x: {
            type: 'linear',
            min: bounds.xMin,
            max: bounds.xMax,
            grid: {
              color: 'transparent',
              tickColor: colors['axisGrid'],
            },
            border: { color: colors['axisBorder'] },
            ticks: {
              color: colors['axisTick'],
              count: 3,
              align: 'end',
              callback: (v: any) => {
                const date = new Date(Number(v));
                const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
                if (date.getFullYear() !== today.getFullYear()) {
                  opts.year = '2-digit';
                }
                return date.toLocaleDateString(undefined, opts);
              },
            },
            afterBuildTicks: (scale: any) => {
              const desiredVisibleCount = 3;
              const targetGeneratedCount = desiredVisibleCount + 1; // one extra, since we drop the first
              // Fallback: if auto-generation produced fewer than needed, build evenly-spaced ticks
              if (scale.ticks.length < targetGeneratedCount) {
                const { min, max } = scale;
                const step = (max - min) / (targetGeneratedCount - 1);
                scale.ticks = Array.from({ length: targetGeneratedCount }, (_, i) => ({
                  value: min + step * i,
                }));
              }
              // Drop the first tick entirely so remaining ticks reclaim its space
              if (scale.ticks.length > 1) {
                scale.ticks.shift();
              }
            },
          },
          y: {
            min: bounds.yMin,
            max: bounds.yMax,
            grid: {
              color: colors['axisGrid'],
              tickColor: 'transparent',
            },
            border: { display: false },
            ticks: {
              color: colors['axisTick'],
              maxTicksLimit: 8,
              callback: (v: number) => formatWeight(v, unitLbl, -1),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false },
          zoom: {
            limits: {
              x: { min: xMinLimit, max: xMaxLimit, minRange: 5 * 86400000 },
            },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
            pan: { enabled: true, mode: 'x' },
          } as any,
        },
      } as any,
    } as any;

    if (this.chart && this.chart.canvas !== canvas) {
      this.destroyChart();
    }

    if (!this.chart) {
      this.chart = new Chart(canvas, config);
      this.pendingViewport = null;
      return;
    }

    const viewport = this.pendingViewport;
    if (viewport) {
      config.options.scales.x.min = viewport.xMin;
      config.options.scales.x.max = viewport.xMax;
    }

    this.chart.data = config.data;
    this.chart.options = config.options;
    this.chart.update('none');
    this.pendingViewport = null;
  }

  private getCurrentViewport(): ViewportState | null {
    const xScale = this.chart?.scales?.['x'] as any;
    if (!xScale || !Number.isFinite(xScale.min) || !Number.isFinite(xScale.max)) {
      return null;
    }

    return { xMin: xScale.min, xMax: xScale.max };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private handleChartInteraction(evt: any, chart: any): void {
    if (evt.x == null) return; // e.g. mouseout events have no position
    const xScale = chart.scales['x'];
    const valueMs = xScale.getValueForPixel(evt.x);
    if (!Number.isFinite(valueMs)) return;
    this.selectedDateMs.set(valueMs);
  }

  private getTrendLine(entries: WeightEntry[]): Pt[] {
    if (!entries.length) return [];
    const startDate = entries[0].dateMs;
    return entries.filter(p => p.dateMs >= startDate).map(p => ({ x: p.dateMs, y: p.trend }));
  }

  private buildGuideDatasets(goals: Goal[], colors: ChartColors, maintRange: number): any[] {
    if (!goals.length) return [];

    const sortedGoals = [...goals].sort((a, b) => a.startDateMs - b.startDateMs);
    const datasets: any[] = [];

    for (const goal of sortedGoals) {
      const startDateMs = goal.startDateMs;
      const goalDateMs = goal.goalDateMs;
      if (!Number.isFinite(goalDateMs) || !Number.isFinite(startDateMs)) continue;

      const startPt: Pt = { x: startDateMs, y: goal.startWeight };

      let dataPts: Pt[];
      if (goal.type === 'Maintenance') {
        dataPts = [
          { x: startDateMs, y: goal.goalWeight },
          { x: goalDateMs, y: goal.goalWeight },
        ];
        // Add band boundaries
        datasets.push({
          label: 'Guide Upper',
          data: [
            { x: startDateMs, y: goal.goalWeight + maintRange },
            { x: goalDateMs, y: goal.goalWeight + maintRange },
          ],
          borderColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          tension: 0,
          fill: false,
          clip: { left: 7, top: false, right: false, bottom: false },
          order: 5,
        });
        datasets.push({
          label: 'Guide Lower',
          data: [
            { x: startDateMs, y: goal.goalWeight - maintRange },
            { x: goalDateMs, y: goal.goalWeight - maintRange },
          ],
          borderColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          tension: 0,
          fill: '-1',
          backgroundColor: colors['guideBand'],
          clip: { left: 7, top: false, right: false, bottom: false },
          order: 6,
        });
      } else {
        dataPts = [startPt, { x: goalDateMs, y: goal.goalWeight }];
      }

      datasets.push({
        label: 'Guide',
        data: dataPts,
        borderColor: colors['guideLine'],
        borderWidth: 1.5,
        borderDash: [8, 5],
        pointRadius: 2,
        pointHitRadius: 20,
        pointBackgroundColor: colors['guideLine'],
        pointBorderColor: colors['guideLine'],
        pointHoverRadius: 5,
        tension: 0,
        fill: false,
        clip: { left: 7, top: false, right: false, bottom: false },
        order: 4,
      });
    }

    return datasets;
  }

  private getBounds(
    entries: WeightEntry[],
    goals: Goal[],
    range: RangeMode,
    maintRange: number,
    unitLbl: WeightUnit,
    todayMs: number,
  ): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const weights = entries.map(e => e.weight);
    for (const g of goals) {
      weights.push(g.startWeight);
      if (g.type === 'Maintenance') {
        weights.push(g.goalWeight + maintRange, g.goalWeight - maintRange);
      } else {
        weights.push(g.goalWeight);
      }
    }

    let xMin = todayMs - 30 * 86400000;
    let xMax = todayMs;

    if (range === 'journey' && (entries.length || goals.length)) {
      xMin = Math.min(entries[0].dateMs, goals[0].startDateMs);
    } else if (range === 'to-goal' && goals.length > 0) {
      xMin = goals[0].startDateMs;
      const futureGoals = goals.filter(g => g.goalDateMs >= todayMs);
      xMax = futureGoals.length ? Math.min(...futureGoals.map(g => g.goalDateMs)) : xMax;
    } else if (range === 'history' && (entries.length || goals.length)) {
      xMin = Math.min(entries[0].dateMs, goals[0].startDateMs);
    }

    // Ensure the visible range is at least 5 days
    if (xMax - xMin < 5 * 86400000) {
      xMax = xMin + 5 * 86400000;
    }

    let yMin = weights.length ? Math.min(...weights) : 70;
    let yMax = weights.length ? Math.max(...weights) : 90;

    // Minimum 2kg range
    const minYrange = kgToUnit(2, unitLbl);
    if (yMax - yMin < minYrange) {
      const mid = (yMin + yMax) / 2;
      yMin = mid - minYrange / 2;
      yMax = mid + minYrange / 2;
    }

    return { xMin, xMax, yMin, yMax };
  }

  // ── Chart Colors ─────────────────────────────────────────────────────────────

  private getChartColors(): ChartColors {
    return {
      guideLine: this.cssTheme.rgbaVar('--ion-color-primary-rgb', 0.35, '0, 179, 155'),
      guideBand: this.cssTheme.rgbaVar('--ion-color-primary-rgb', 0.1, '0, 179, 155'),
      scaleLine: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 0.4, '6, 182, 212'),
      scaleDot: this.cssTheme.rgbaVar('--ion-color-step-200-rgb', 1, '203, 213, 225'),
      scaleDotHover: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 1, '203, 213, 225'),
      scaleDotBorder: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 0.85, '6, 182, 212'),
      scaleDotBorderHover: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 1, '6, 182, 212'),
      trendLine: this.cssTheme.themeVar('--ion-color-secondary', '#6366f1'),
      trendBand: this.cssTheme.rgbaVar('--ion-color-secondary-rgb', 0.075, '99, 102, 241'),
      trendDotHover: this.cssTheme.themeVar('--ion-color-secondary', '#6366f1'),
      trendDotBorderHover: this.cssTheme.themeVar('--ion-color-secondary', '#6366f1'),
      axisGrid: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.1, '15, 23, 42'),
      axisBorder: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.2, '15, 23, 42'),
      axisTick: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.65, '15, 23, 42'),
    };
  }
}
