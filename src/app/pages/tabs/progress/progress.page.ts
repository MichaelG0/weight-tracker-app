import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import { DatabaseService, Goal, WeightEntry } from 'src/app/services/database.service';

import 'hammerjs';
import { GlassHeaderBackdropDirective } from 'src/app/directives/glass-header-backdrop.directive';
Chart.register(zoomPlugin);

export type RangeMode = 'journey' | 'month' | 'to-goal';
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
  readonly showDaily = signal<boolean>(false);
  readonly showTrend = signal<boolean>(true);

  private readonly allEntries = toSignal(this.db.entries$, { initialValue: [] as WeightEntry[] });
  readonly goals = toSignal(this.db.goals$, { initialValue: [] as Goal[] });

  private chart: Chart | null = null;
  private pendingViewport: ViewportState | null = null;

  readonly sortedAll = computed(() => [...this.allEntries()].sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at)));

  readonly listEntries = computed(() => [...this.sortedAll()].reverse());

  constructor() {
    addIcons({ analyticsOutline, informationCircleOutline, flagOutline, addOutline, trashOutline });

    effect(() => {
      const entries = this.sortedAll();
      const goals = this.goals();
      const range = this.rangeMode();
      const showDaily = this.showDaily();
      const showTrend = this.showTrend();
      this.cssTheme.isDarkMode(); // Trigger re-render on theme change
      const canvas = this.weightChart()?.nativeElement as HTMLCanvasElement;

      if (!canvas || entries.length === 0) {
        this.destroyChart();
        return;
      }

      this.renderChart(canvas, entries, goals, range, showDaily, showTrend);
    });
  }

  setRange(range: RangeMode): void {
    this.rangeMode.set(range);
  }

  // ── Goal management ─────────────────────────────────────────────────────────

  async addGoal(): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SetGoalModalComponent,
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data) {
      this.db.addGoal(data).pipe(take(1)).subscribe();
    }
  }

  async editGoal(goal: Goal): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: SetGoalModalComponent,
      componentProps: { goal },
      breakpoints: [0, 0.85, 1],
      initialBreakpoint: 0.85,
      handleBehavior: 'cycle',
    });
    await modal.present();

    const { data, role } = await modal.onWillDismiss();
    if (role === 'confirm' && data && data.id != null) {
      this.db.updateGoal(data).pipe(take(1)).subscribe();
    }
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
            this.db.addGoal({
              start_weight_kg: goal.start_weight_kg,
              goal_weight_kg: goal.goal_weight_kg,
              start_date: goal.start_date,
              goal_date: goal.goal_date,
              label: goal.label,
            }).pipe(take(1)).subscribe();
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
  ): void {
    const colors: ChartColors = this.getChartColors();

    const dots: Pt[] = entries.map(e => ({ x: +new Date(e.logged_at), y: e.weight_kg }));
    const trendLine: Pt[] = this.hackersDietAvg(entries);
    const guideDatasets = this.buildGuideDatasets(entries, goals, trendLine, colors);
    const lastGoalDateMs = goals.length > 0 ? Math.max(...goals.map(g => +new Date(g.goal_date))) : null;
    const bounds = this.getBounds(entries, goals, lastGoalDateMs, range);

    const earliestEntryMs = entries.length > 0 ? +new Date(entries[0].logged_at) : Date.now() - 30 * 86400000;
    const earliestGoalMs = goals.length > 0 ? Math.min(...goals.map(g => +new Date(g.start_date))) : Infinity;
    const xMinLimit = Math.min(earliestEntryMs, earliestGoalMs);
    const xMaxLimit = lastGoalDateMs !== null ? lastGoalDateMs + 7 * 86400000 : Date.now() + 86400000;

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
                  pointHoverRadius: 8,
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
              callback: (v: any) => new Date(Number(v)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
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
              callback: (v: any) => `${Number(v).toFixed(1)}`,
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
            mode: 'nearest',
            axis: 'x',
            intersect: false,
            filter: (item: any) => item.dataset.label !== 'Guide',
            callbacks: {
              title: (items: any[]) => {
                const x = items[0]?.parsed?.x;
                return x ? new Date(x).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';
              },
              label: (ctx: any) => `  ${Number(ctx.parsed.y).toFixed(1)} kg`,
            },
          } as any,
          zoom: {
            limits: {
              x: { min: xMinLimit, max: xMaxLimit },
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

  private hackersDietAvg(entries: WeightEntry[]): Pt[] {
    if (!entries || entries.length === 0) return [];

    const ALPHA = 0.1; // 10% smoothing factor
    const pts: Pt[] = [];

    // 2. The first day's trend is simply the first day's logged weight
    let currentTrend = entries[0].weight_kg;

    for (const entry of entries) {
      const timestamp = new Date(entry.logged_at).getTime();
      const currentWeight = entry.weight_kg;

      // 3. Apply the Hacker's Diet formula
      currentTrend = currentTrend + ALPHA * (currentWeight - currentTrend);

      pts.push({
        x: timestamp,
        y: currentTrend,
      });
    }

    return pts;
  }

  private buildGuideDatasets(entries: WeightEntry[], goals: Goal[], trendLine: Pt[], colors: ChartColors): any[] {
    if (!goals.length) return [];

    const sortedGoals = [...goals].sort((a, b) => +new Date(a.start_date) - +new Date(b.start_date));
    const datasets: any[] = [];

    for (const goal of sortedGoals) {
      const startDateMs = +new Date(goal.start_date);
      const goalDateMs = +new Date(goal.goal_date);
      if (!Number.isFinite(goalDateMs) || !Number.isFinite(startDateMs)) continue;

      const startPt: Pt = { x: startDateMs, y: goal.start_weight_kg };

      let dataPts: Pt[];
      if (goal.label === 'maintenance') {
        dataPts = [{ x: startDateMs, y: goal.goal_weight_kg }, { x: goalDateMs, y: goal.goal_weight_kg }];
        // Add band boundaries
        datasets.push({
          label: 'Guide Upper',
          data: [{ x: startDateMs, y: goal.goal_weight_kg + 0.9 }, { x: goalDateMs, y: goal.goal_weight_kg + 0.9 }],
          borderColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          tension: 0,
          fill: false,
          order: 5,
        });
        datasets.push({
          label: 'Guide Lower',
          data: [{ x: startDateMs, y: goal.goal_weight_kg - 0.9 }, { x: goalDateMs, y: goal.goal_weight_kg - 0.9 }],
          borderColor: 'transparent',
          borderWidth: 0,
          pointRadius: 0,
          tension: 0,
          fill: '-1',
          backgroundColor: colors['guideBand'],
          order: 6,
        });
      } else {
        dataPts = [startPt, { x: goalDateMs, y: goal.goal_weight_kg }];
      }

      datasets.push({
        label: 'Guide',
        data: dataPts,
        borderColor: colors['guideLine'],
        borderWidth: 1.5,
        borderDash: [8, 5],
        pointRadius: 0,
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
  ): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const now = Date.now();
    const weights = entries.map(e => e.weight_kg);
    for (const g of goals) weights.push(g.goal_weight_kg);

    let xMin: number;
    let xMax: number;

    if (range === 'month') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      xMin = +cutoff;
      xMax = now;
    } else if (range === 'to-goal' && entries.length > 0 && goals.length > 0 && lastGoalDateMs !== null) {
      xMin = +new Date(entries[0].logged_at);
      xMax = lastGoalDateMs;
    } else {
      xMin = entries.length > 0 ? +new Date(entries[0].logged_at) : now - 30 * 86400000;
      xMax = now;
    }

    const mn = weights.length ? Math.min(...weights) : 70;
    const mx = weights.length ? Math.max(...weights) : 90;
    const pad = Math.max((mx - mn) * 0.05, 0.125);
    return { xMin, xMax, yMin: mn - pad, yMax: mx + pad };
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
