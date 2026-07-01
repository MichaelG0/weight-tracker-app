import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  IonHeader,
  IonToolbar,
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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { analyticsOutline, informationCircleOutline } from 'ionicons/icons';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import { CssThemeService } from 'src/app/services/css-theme.service';
import { DatabaseService, UserSettings, WeightEntry } from 'src/app/services/database.service';

import 'hammerjs';
Chart.register(zoomPlugin);

export type RangeMode = 'current' | 'month' | 'full';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProgressPage {
  private readonly db = inject(DatabaseService);
  private readonly cssTheme = inject(CssThemeService);

  readonly weightChart = viewChild<ElementRef>('weightChart');

  readonly rangeMode = signal<RangeMode>('current');
  readonly showDaily = signal<boolean>(false);
  readonly showTrend = signal<boolean>(true);

  private readonly allEntries = toSignal(this.db.entries$, { initialValue: [] as WeightEntry[] });
  private readonly settings = toSignal(this.db.settings$, { initialValue: null });

  private chart: Chart | null = null;
  private pendingViewport: ViewportState | null = null;

  readonly sortedAll = computed(() => [...this.allEntries()].sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at)));

  readonly listEntries = computed(() => [...this.sortedAll()].reverse());

  constructor() {
    addIcons({ analyticsOutline, informationCircleOutline });

    effect(() => {
      const entries = this.sortedAll();
      const settings = this.settings();
      const range = this.rangeMode();
      const showDaily = this.showDaily();
      const showTrend = this.showTrend();
      this.cssTheme.isDarkMode(); // Trigger re-render on theme change
      const canvas = this.weightChart()?.nativeElement as HTMLCanvasElement;

      if (!canvas || entries.length === 0) {
        this.destroyChart();
        return;
      }

      this.renderChart(canvas, entries, settings, range, showDaily, showTrend);
    });
  }

  setRange(range: RangeMode): void {
    this.rangeMode.set(range);
  }

  toggleShowDaily(): void {
    if (this.showDaily() && !this.showTrend()) {
      return;
    }

    this.pendingViewport = this.getCurrentViewport();
    this.showDaily.update(v => !v);
  }

  toggleShowTrend(): void {
    if (this.showTrend() && !this.showDaily()) {
      return;
    }

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
    settings: UserSettings | null,
    range: RangeMode,
    showDaily: boolean,
    showTrend: boolean,
  ): void {
    const goalWeight: number | null = settings?.goal_weight_kg ?? null;
    const goalDateMs = this.resolveGoalDateMs(settings);
    const colors: ChartColors = this.getChartColors();

    const dots: Pt[] = entries.map(e => ({ x: +new Date(e.logged_at), y: e.weight_kg }));
    const trendLine: Pt[] = this.hackersDietAvg(entries);
    const guide: Pt[] = goalWeight !== null && goalDateMs !== null ? this.guideLine(entries, goalWeight, goalDateMs) : [];
    const bounds = this.getBounds(entries, goalWeight, goalDateMs, range);

    const xMinLimit = entries.length > 0 ? +new Date(entries[0].logged_at) : Date.now() - 30 * 86400000;
    const xMaxLimit = goalDateMs !== null ? goalDateMs + 7 * 86400000 : Date.now() + 86400000;

    const config = {
      type: 'line',
      data: {
        datasets: [
          {
            // ── Guide line (ideal trajectory)
            label: 'Guide',
            data: guide,
            borderColor: colors['guideLine'],
            borderWidth: 1.5,
            borderDash: [8, 5],
            pointRadius: 0,
            tension: 0,
            fill: false,
            order: 4,
          } as any,
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

  private guideLine(sorted: WeightEntry[], goal: number, goalDateMs: number): Pt[] {
    if (!sorted.length) return [];
    return [
      { x: +new Date(sorted[0].logged_at), y: sorted[0].weight_kg },
      { x: goalDateMs, y: goal },
    ];
  }

  private resolveGoalDateMs(settings: UserSettings | null): number | null {
    const parsedGoalDateMs = settings?.goal_date ? +new Date(settings.goal_date) : NaN;
    if (Number.isFinite(parsedGoalDateMs)) {
      return parsedGoalDateMs;
    }

    return null;
  }

  private getBounds(
    entries: WeightEntry[],
    goalWeight: number | null,
    goalDateMs: number | null,
    range: RangeMode,
  ): { xMin: number; xMax: number; yMin: number; yMax: number } {
    const now = Date.now();
    const weights = entries.map(e => e.weight_kg);
    if (goalWeight !== null) weights.push(goalWeight);

    let xMin: number;
    let xMax: number;

    if (range === 'month') {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      xMin = +cutoff;
      xMax = now + 86400000;
    } else if (range === 'full' && entries.length > 0 && goalWeight !== null && goalDateMs !== null) {
      xMin = +new Date(entries[0].logged_at);
      xMax = goalDateMs;
    } else {
      xMin = entries.length > 0 ? +new Date(entries[0].logged_at) : now - 30 * 86400000;
      xMax = now + 86400000;
    }

    const mn = weights.length ? Math.min(...weights) : 70;
    const mx = weights.length ? Math.max(...weights) : 90;
    const pad = Math.max((mx - mn) * 0.2, 0.5);
    return { xMin, xMax, yMin: mn - pad, yMax: mx + pad };
  }

  // ── Chart Colors ─────────────────────────────────────────────────────────────

  private getChartColors(): ChartColors {
    return {
      guideLine: this.cssTheme.rgbaVar('--ion-color-tertiary-rgb', 0.35, '155, 93, 229'),
      scaleLine: this.cssTheme.rgbaVar('--ion-color-secondary-rgb', 0.4, '0, 187, 249'),
      scaleDot: this.cssTheme.rgbaVar('--ion-background-color-rgb', 1, '248, 250, 252'),
      scaleDotHover: this.cssTheme.rgbaVar('--ion-background-color-rgb', 1, '248, 250, 252'),
      scaleDotBorder: this.cssTheme.rgbaVar('--ion-color-secondary-rgb', 0.85, '0, 187, 249'),
      scaleDotBorderHover: this.cssTheme.rgbaVar('--ion-color-secondary-rgb', 1, '0, 187, 249'),
      trendLine: this.cssTheme.themeVar('--ion-color-primary', '#00b39b'),
      axisGrid: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.1, '15, 23, 42'),
      axisBorder: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.2, '15, 23, 42'),
      axisTick: this.cssTheme.rgbaVar('--ion-text-color-rgb', 0.65, '15, 23, 42'),
      tooltipBackground: this.cssTheme.rgbaVar('--ion-background-color-rgb', 0.95, '248, 250, 252'),
      tooltipTitle: this.cssTheme.themeVar('--ion-color-primary', '#00b39b'),
      tooltipBody: this.cssTheme.themeVar('--ion-text-color', '#0f172a'),
      tooltipBorder: this.cssTheme.rgbaVar('--ion-color-primary-rgb', 0.3, '0, 179, 155'),
    };
  }
}
