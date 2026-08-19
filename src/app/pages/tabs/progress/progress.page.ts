import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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

import 'hammerjs';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
import { kgToUnitNoFixed } from 'src/app/utils/unit-conversion.util';
import { todayLocalMidnightDate, todayLocalMidnightMs } from 'src/app/utils/date-converter.util';
Chart.register(zoomPlugin);

export type RangeMode = 'journey' | 'month' | 'to-goal' | 'full';
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
  trendDotBorderHover: string;
  axisGrid: string;
  axisBorder: string;
  axisTick: string;
  tooltipBackground: string;
  tooltipTitle: string;
  tooltipBody: string;
  tooltipBorder: string;
}

const LIST_PAGE_SIZE = 250;

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressPage {
  private readonly db = inject(DatabaseService);
  private readonly cssTheme = inject(CssThemeService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);

  readonly weightChart = viewChild<ElementRef>('weightChart');

  readonly rangeMode = signal<RangeMode>('journey');
  readonly showDaily = signal<boolean>(true);
  readonly showTrend = signal<boolean>(true);

  readonly allEntries = this.db.entries;
  readonly goals = this.db.goals;
  readonly unitLabel = toSignal(this.db.weightUnit$, { initialValue: 'kg' });

  private chart: Chart | null = null;
  private pendingViewport: ViewportState | null = null;

  constructor() {
    addIcons({ analyticsOutline, informationCircleOutline, flagOutline, addOutline, trashOutline });

    effect(() => {
      const allEntries = this.allEntries();
      const goals = this.goals();
      const range = this.rangeMode();
      const showDaily = this.showDaily();
      const showTrend = this.showTrend();
      const unitLbl = this.unitLabel();
      this.cssTheme.isDarkMode(); // Trigger re-render on theme change
      const canvas = this.weightChart()?.nativeElement as HTMLCanvasElement;

      // Filter entries and goals: cut off before the most recent goal's start date (unless 'full')
      let filteredEntries = allEntries;
      let filteredGoals = goals;
      if (range !== 'full' && goals.length > 0) {
        const todayMs = todayLocalMidnightMs();

        const activeGoals = goals.filter(g => g.startDateMs <= todayMs);
        if (activeGoals.length > 0) {
          const cutoff = Math.max(...activeGoals.map(g => g.startDateMs));
          filteredEntries = allEntries.filter(e => e.dateMs >= cutoff);
          filteredGoals = goals.filter(g => g.startDateMs >= cutoff);
        }
      }

      if (!canvas || filteredEntries.length === 0) {
        this.destroyChart();
        return;
      }

      this.renderChart(canvas, filteredEntries, filteredGoals, range, showDaily, showTrend, unitLbl);
    });
  }

  setRange(range: RangeMode): void {
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
    this.showDaily.update(v => !v);
  }

  toggleShowTrend(): void {
    this.pendingViewport = this.getCurrentViewport();
    this.showTrend.update(v => !v);
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
  ): void {
    const colors: ChartColors = this.getChartColors();

    const dots: Pt[] = entries.map(e => ({ x: e.dateMs, y: e.weight }));
    const trendLine: Pt[] = this.getTrendLine(entries);
    const maintRange = kgToUnitNoFixed(0.907186, unitLbl);
    const guideDatasets = this.buildGuideDatasets(goals, colors, maintRange);
    const lastGoalDateMs = goals.length > 0 ? Math.max(...goals.map(g => g.goalDateMs)) : null;
    const bounds = this.getBounds(entries, goals, lastGoalDateMs, range, maintRange, unitLbl);

    const earliestEntryMs = entries.length > 0 ? entries[0].dateMs : todayLocalMidnightMs() - 30 * 86400000;
    const earliestGoalMs = goals.length > 0 ? Math.min(...goals.map(g => g.startDateMs)) : Infinity;
    const xMinLimit = Math.min(earliestEntryMs, earliestGoalMs) - 1 * 86400000;
    const xMaxLimit = lastGoalDateMs !== null ? lastGoalDateMs + 1 * 86400000 : todayLocalMidnightMs() + 1 * 86400000;

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
                  borderWidth: 1.5,
                  borderDash: [2, 3],
                  pointRadius: 3,
                  pointHitRadius: 26,
                  pointHoverRadius: 7,
                  pointBorderColor: colors['scaleDotBorder'],
                  pointBorderWidth: 2,
                  hoverBackgroundColor: colors['scaleDotHover'],
                  hoverBorderColor: colors['scaleDotBorderHover'],
                  hoverBorderWidth: 3,
                  tension: 0,
                  fill: false,
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
                  hoverBorderColor: colors['trendDotBorderHover'],
                  hoverBorderWidth: 2,
                  tension: 0.35,
                  fill: false,
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
        scales: {
          x: {
            type: 'linear',
            min: bounds.xMin,
            max: bounds.xMax,
            grid: { color: colors['axisGrid'] },
            border: { color: colors['axisBorder'] },
            ticks: {
              color: colors['axisTick'],
              maxTicksLimit: 5,
              callback: (v: any) => {
                const date = new Date(Number(v));
                const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
                if (date.getFullYear() !== todayLocalMidnightDate().getFullYear()) {
                  opts.year = '2-digit';
                }
                return date.toLocaleDateString(undefined, opts);
              },
            },
          },
          y: {
            min: bounds.yMin,
            max: bounds.yMax,
            grid: { color: colors['axisGrid'] },
            border: { color: colors['axisBorder'] },
            ticks: {
              color: colors['axisTick'],
              maxTicksLimit: 8,
              callback: (v: number) => (unitLbl === 'st' ? v.toFixed(2) : v.toFixed(1)),
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: colors['tooltipBackground'],
            titleColor: colors['tooltipTitle'],
            bodyColor: colors['tooltipBody'],
            borderColor: colors['tooltipBorder'],
            borderWidth: 1,
            padding: 12,
            caretPadding: 20,
            mode: 'nearest',
            axis: 'x',
            intersect: false,
            filter: (item: any) => item.dataset.label !== 'Guide Upper' && item.dataset.label !== 'Guide Lower',
            callbacks: {
              title: (items: any[]) => {
                const x = items[0]?.parsed?.x;
                return x ? new Date(x).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
              },
              label: (ctx: any) => {
                const val = Number(ctx.parsed.y).toFixed(1);
                if (ctx.dataset.label === 'Guide') {
                  const tag = ctx.dataIndex === 0 ? 'Start' : 'Goal';
                  return `  ${tag}: ${val} ${unitLbl}`;
                }
                return `  ${val} ${unitLbl}`;
              },
            },
          } as any,
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

  private getTrendLine(entries: WeightEntry[]): Pt[] {
    if (!entries.length) return [];
    const startDate = entries[0].dateMs;
    return entries
      .filter(p => p.dateMs >= startDate)
      .map(p => ({ x: p.dateMs, y: p.trend }));
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
        order: 4,
      });
    }

    return datasets;
  }

  private getBounds(
    entries: WeightEntry[],
    goals: Goal[],
    lastGoalDateMs: number | null,
    range: RangeMode,
    maintRange: number,
    unitLbl: WeightUnit,
  ): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const todayMs = todayLocalMidnightMs();

    const weights = entries.map(e => e.weight);
    for (const g of goals) {
      weights.push(g.startWeight);
      if (g.type === 'Maintenance') {
        weights.push(g.goalWeight + maintRange, g.goalWeight - maintRange);
      } else {
        weights.push(g.goalWeight);
      }
    }

    let xMin: number;
    let xMax: number;

    if (range === 'month') {
      const cutoff = todayLocalMidnightDate();
      cutoff.setDate(cutoff.getDate() - 30);
      xMin = +cutoff;
      xMax = todayMs;
    } else if (range === 'to-goal' && entries.length > 0 && goals.length > 0) {
      xMin = entries[0].dateMs;
      const futureGoalDates = goals.map(g => g.goalDateMs).filter(d => d > todayMs);
      xMax = futureGoalDates.length > 0 ? Math.min(...futureGoalDates) : (lastGoalDateMs ?? todayMs);
    } else if (range === 'full') {
      xMin = entries.length > 0 ? entries[0].dateMs : todayMs - 30 * 86400000;
      xMax = todayMs;
    } else {
      xMin = entries.length > 0 ? entries[0].dateMs : todayMs - 30 * 86400000;
      xMax = todayMs;
    }

    // Ensure the visible range is at least 5 days
    if (xMax - xMin < 5 * 86400000) {
      xMin -= 0.25 * 86400000;
      xMax = xMin + 5 * 86400000;
    }

    let yMin = weights.length ? Math.min(...weights) : 70;
    let yMax = weights.length ? Math.max(...weights) : 90;

    // Minimum 2kg range
    const minYrange = kgToUnitNoFixed(2, unitLbl);
    if (yMax - yMin < minYrange) {
      const mid = (yMin + yMax) / 2;
      yMin = mid - minYrange / 2;
      yMax = mid + minYrange / 2;
    }

    const yPad = (yMax - yMin) * 0.05; // 5% padding

    return { xMin, xMax, yMin: yMin - yPad, yMax: yMax + yPad };
  }

  // ── Chart Colors ─────────────────────────────────────────────────────────────

  private getChartColors(): ChartColors {
    return {
      guideLine: this.cssTheme.rgbaVar('--ion-color-primary-rgb', 0.35, '0, 179, 155'),
      guideBand: this.cssTheme.rgbaVar('--ion-color-primary-rgb', 0.1, '0, 179, 155'),
      scaleLine: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 0.4, '6, 182, 212'),
      scaleDot: this.cssTheme.rgbaVar('--ion-color-step-200-rgb', 1, '203, 213, 225'),
      scaleDotHover: this.cssTheme.rgbaVar('--ion-color-step-200-rgb', 1, '203, 213, 225'),
      scaleDotBorder: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 0.85, '6, 182, 212'),
      scaleDotBorderHover: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 1, '6, 182, 212'),
      trendLine: this.cssTheme.themeVar('--ion-color-secondary', '#6366f1'),
      trendDotBorderHover: this.cssTheme.themeVar('--ion-color-secondary', '#6366f1'),
      axisGrid: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.1, '15, 23, 42'),
      axisBorder: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.2, '15, 23, 42'),
      axisTick: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.65, '15, 23, 42'),
      tooltipBackground: this.cssTheme.rgbaVar('--ion-background-color-deep-rgb', 0.95, '248, 250, 252'),
      tooltipTitle: this.cssTheme.themeVar('--ion-color-secondary', '#6366f1'),
      tooltipBody: this.cssTheme.themeVar('--ion-text-color', '#0f172a'),
      tooltipBorder: this.cssTheme.rgbaVar('--ion-color-secondary-rgb', 0.3, '99, 102, 241'),
    };
  }
}
