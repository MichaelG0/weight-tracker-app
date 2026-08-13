import { ChangeDetectionStrategy, Component, inject, Input, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonList,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { closeOutline, refreshOutline } from 'ionicons/icons';
import { DatabaseService, Goal, GoalType, WeightEntry } from 'src/app/services/database.service';
import { PureFnPipe } from 'src/app/pipes/pure-fn.pipe';
import { take } from 'rxjs';

@Component({
  selector: 'app-set-goal-modal',
  templateUrl: './set-goal-modal.component.html',
  styleUrls: ['./set-goal-modal.component.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonChip,
    IonIcon,
    IonContent,
    IonList,
    IonItem,
    IonInput,
    IonToggle,
    PureFnPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SetGoalModalComponent implements OnInit {
  private readonly modalCtrl = inject(ModalController);
  private readonly db = inject(DatabaseService);

  @Input() goal?: Goal;

  isEditing = false;
  useCustomEndDate = false;
  weeklySpeed: number | null = null;
  readonly unitLabel = toSignal(this.db.weightUnit$, { initialValue: 'kg' });

  private allEntries: WeightEntry[] = [];
  private allGoals: Goal[] = [];

  readonly formData = {
    startWeight: null as number | null,
    weight: null as number | null,
    startDate: '',
    endDate: '',
    label: 'weight loss' as GoalType,
  };

  constructor() {
    addIcons({ closeOutline, refreshOutline });
  }

  ngOnInit(): void {
    // Load existing goals for overlap validation
    this.db.goals$.pipe(take(1)).subscribe(goals => {
      this.allGoals = goals;
      if (!this.isEditing) {
        this.formData.startDate = this.getDefaultStartDate();
      }
    });

    // Grab latest entries for the hacker's diet EMA (only need recent entries for a stable trend)
    this.db.entries$.pipe(take(1)).subscribe(entries => {
      this.allEntries = [...entries]
        .sort((a, b) => +new Date(a.logged_at) - +new Date(b.logged_at))
        .slice(-50);

      if (!this.isEditing) {
        this.refreshStartWeight();
      }
    });

    if (this.goal) {
      this.isEditing = true;
      this.formData.startWeight = this.goal.start_weight_kg;
      this.formData.weight = this.goal.goal_weight_kg;
      this.formData.startDate = this.goal.start_date.substring(0, 10);
      this.formData.endDate = this.goal.goal_date.substring(0, 10);
      this.formData.label = this.goal.label;
    }
  }

  refreshStartWeight(): void {
    if (this.allEntries.length === 0) return;

    const ALPHA = 0.1;
    let currentTrend = this.allEntries[0].weight_kg;
    for (const entry of this.allEntries) {
      currentTrend = currentTrend + ALPHA * (entry.weight_kg - currentTrend);
    }

    this.formData.startWeight = parseFloat(currentTrend.toFixed(1));
    this.onStartWeightChange();
  }

  selectGoalType(type: GoalType): void {
    this.formData.label = type;
    this.onGoalTypeChange();
  }

  onGoalTypeChange(): void {
    if (this.formData.label === 'maintenance') {
      this.formData.weight = this.formData.startWeight;
    }
    this.recalculateEndDate();
  }

  onStartWeightChange(): void {
    if (this.formData.label === 'maintenance') {
      this.formData.weight = this.formData.startWeight;
    }
    this.recalculateEndDate();
  }

  onSpeedChange(): void {
    this.recalculateEndDate();
  }

  onCustomEndDateToggle(): void {
    if (!this.useCustomEndDate) {
      this.recalculateEndDate();
    }
  }

  private recalculateEndDate(): void {
    if (this.useCustomEndDate || this.formData.label === 'maintenance') return;
    if (!this.weeklySpeed || !this.formData.startWeight || !this.formData.weight || !this.formData.startDate) return;
    if (this.weeklySpeed <= 0) return;

    const totalChange = Math.abs(this.formData.weight - this.formData.startWeight);
    const weeklyChange = this.formData.startWeight * (this.weeklySpeed / 100);
    const weeks = totalChange / weeklyChange;
    const days = Math.ceil(weeks * 7);

    const start = new Date(this.formData.startDate);
    start.setDate(start.getDate() + days);
    this.formData.endDate = start.toISOString().substring(0, 10);
  }

  get isFormValid(): boolean {
    if (!this.formData.weight || !this.formData.startDate || !this.formData.endDate || !this.formData.startWeight) return false;

    if (!this.useCustomEndDate && this.formData.label !== 'maintenance' && !this.weeklySpeed) return false;

    if (this.formData.startDate >= this.formData.endDate) return false;

    const w = this.formData.weight;
    const s = this.formData.startWeight;

    if (this.formData.label === 'weight loss' && w >= s) return false;
    if (this.formData.label === 'weight gain' && w <= s) return false;
    if (this.formData.label === 'maintenance' && w !== s) return false;

    // Overlap check
    if (this.getOverlapError(this.formData.startDate, this.formData.endDate)) return false;

    return true;
  }

  filterKey(event: KeyboardEvent): void {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  submit(): void {
    if (!this.isFormValid) return;

    const result: Partial<Goal> & {
      start_weight_kg: number;
      goal_weight_kg: number;
      start_date: string;
      goal_date: string;
      label: GoalType;
    } = {
      start_weight_kg: this.formData.startWeight!,
      goal_weight_kg: this.formData.weight!,
      start_date: this.formData.startDate,
      goal_date: this.formData.endDate,
      label: this.formData.label,
    };

    if (this.isEditing && this.goal) {
      result.id = this.goal.id;
    }

    this.modalCtrl.dismiss(result, 'confirm');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private getDefaultStartDate(): string {
    const today = new Date().toISOString().substring(0, 10);

    if (this.allGoals.length === 0) return today;

    // Default to end date of the latest goal
    const sorted = [...this.allGoals].sort((a, b) => a.goal_date.localeCompare(b.goal_date));
    const lastEnd = sorted[sorted.length - 1].goal_date.substring(0, 10);
    return lastEnd > today ? lastEnd : today;
  }

  // ── Piped Methods ───────────────────────────────────────────────────────

  getSpeedLabel = (label: GoalType): string => {
    if (label === 'weight loss') return 'Rate (%/week) — recommended: 0.5–1.0';
    if (label === 'weight gain') return 'Rate (%/week) — recommended: 0.25–0.5';
    return 'Rate (%/week)';
  };

  getWeightDirectionError = (weight: number | null, startWeight: number | null, label: GoalType): string => {
    if (!weight || !startWeight) return '';
    if (label === 'weight loss' && weight >= startWeight) {
      return 'Target weight must be lower than start weight for weight loss';
    }
    if (label === 'weight gain' && weight <= startWeight) {
      return 'Target weight must be higher than start weight for weight gain';
    }
    return '';
  };

  getDateError = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return '';
    if (endDate <= startDate) {
      return 'End date must be after start date';
    }
    return '';
  };

  getOverlapError = (startDate: string, endDate: string): string => {
    if (!startDate || !endDate) return '';
    for (const g of this.allGoals) {
      if (this.isEditing && this.goal && g.id === this.goal.id) continue;
      const gStart = g.start_date.substring(0, 10);
      const gEnd = g.goal_date.substring(0, 10);
      if (startDate < gEnd && endDate > gStart) {
        return `Overlaps with existing goal (${gStart} – ${gEnd})`;
      }
    }
    return '';
  };
}
